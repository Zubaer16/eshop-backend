import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'

for (const guest of [false, true])
  test(`atomic cart add: ${guest ? 'guest' : 'customer'} concurrent increments, replay, rejection and ownership`, async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    const keys: string[] = [],
      guestIds: string[] = []
    const key = () => {
      const id = randomUUID()
      keys.push(id)
      return id
    }
    try {
      const owner = await f.account('OWNER'),
        customer = await f.account('CUSTOMER'),
        other = await f.account('CUSTOMER')
      const category = await (
        await request.post('/v1/admin/categories', {
          headers: bearer(owner.token),
          data: { name: 'Atomic additions', slug: f.slug('add-category') },
        })
      ).json()
      const productResponse = await request.post('/v1/admin/products', {
        headers: bearer(owner.token),
        data: {
          title: 'Atomic add item',
          slug: f.slug('add-product'),
          sku: f.sku('add'),
          priceMinor: 1200,
          currency: 'USD',
          stockOnHand: 30,
          status: 'ACTIVE',
          categoryIds: [category.id],
        },
      })
      expect(productResponse.status()).toBe(201)
      const product = await productResponse.json()
      const capability = guest
        ? await (await request.post('/v1/guest-cart')).json()
        : null
      if (capability) guestIds.push(capability.guestCartId)
      const headers = guest
        ? { 'X-Guest-Cart-Token': capability.guestToken }
        : bearer(customer.token)
      const base = guest ? '/v1/guest-cart' : '/v1/cart'
      const input = {
        requestId: key(),
        productId: product.id,
        variantId: null,
        quantity: 2,
      }
      const add = (data = input) =>
        request.post(base + '/items/add', { headers, data })
      const duplicates = await Promise.all(
        Array.from({ length: 5 }, () => add()),
      )
      expect(duplicates.map((response) => response.status())).toEqual([
        200, 200, 200, 200, 200,
      ])
      expect(
        (await (await request.get(base, { headers })).json()).items[0].quantity,
      ).toBe(2)
      const different = await Promise.all([
        add({ ...input, requestId: key(), quantity: 1 }),
        add({ ...input, requestId: key(), quantity: 1 }),
      ])
      expect(different.map((response) => response.status())).toEqual([200, 200])
      expect(
        (await (await request.get(base, { headers })).json()).items[0].quantity,
      ).toBe(4)
      expect((await add({ ...input, quantity: 3 })).status()).toBe(409)
      expect((await add({ ...input, requestId: 'bad' })).status()).toBe(400)
      expect(
        (await add({ ...input, requestId: key(), quantity: 100 })).status(),
      ).toBe(400)
      expect(
        (await request.post(base + '/items/add', { data: input })).status(),
      ).toBe(401)
      if (!guest) {
        expect(
          (
            await request.post(base + '/items/add', {
              headers: bearer(owner.token),
              data: input,
            })
          ).status(),
        ).toBe(403)
        const otherQuote = await request.post(base + '/items/add', {
          headers: bearer(other.token),
          data: input,
        })
        expect(otherQuote.status()).toBe(200)
        expect((await otherQuote.json()).items[0].quantity).toBe(2)
      }
      await f.db.product.update({
        where: { id: product.id },
        data: { priceMinor: 1350 },
      })
      await f.db.inventoryBalance.update({
        where: { productId: product.id },
        data: { onHand: 3 },
      })
      const replay = await add()
      expect(replay.status()).toBe(200)
      const quote = await replay.json()
      expect(quote.items[0].quantity).toBe(4)
      expect(quote.items[0].unitPriceMinor).toBe(1350)
      expect(quote.items[0].status).toBe('OUT_OF_STOCK')
      expect(quote.checkoutReady).toBe(false)
      const saved = { ...input, requestId: key(), quantity: 1 }
      expect((await add(saved)).status()).toBe(200)
      expect(
        await f.db.idempotencyRecord.count({
          where: { key: saved.requestId },
        }),
      ).toBe(1)
      const changed = await request.put(base + '/items', {
        headers,
        data: { productId: product.id, quantity: 8 },
      })
      expect(changed.status()).toBe(200)
      expect((await changed.json()).items[0].quantity).toBe(8)
      if (!guest) {
        const finalCheck = await request.post('/v1/checkout/reservations', {
          headers,
          data: { countryCode: 'US', requestId: randomUUID() },
        })
        expect(finalCheck.status()).toBe(409)
        expect(await finalCheck.json()).toMatchObject({
          code: 'INSUFFICIENT_STOCK',
          items: [{ requestedQuantity: 8, availableQuantity: 3 }],
        })
      }
      await f.db.inventoryBalance.update({
        where: { productId: product.id },
        data: { onHand: 30 },
      })
      expect((await add(saved)).status()).toBe(200)
      expect((await add(saved)).status()).toBe(200)
      expect(
        (await (await request.get(base, { headers })).json()).items[0].quantity,
      ).toBe(8)
      // Mixed currency and archived products remain rejected by the existing rules.
      await f.db.product.update({
        where: { id: product.id },
        data: { status: 'ARCHIVED' },
      })
      expect(
        (await add({ ...input, requestId: key(), quantity: 1 })).status(),
      ).toBe(409)
    } finally {
      await f.db.idempotencyRecord.deleteMany({ where: { key: { in: keys } } })
      await f.db.guestCart.deleteMany({ where: { id: { in: guestIds } } })
      await f.close()
    }
  })
