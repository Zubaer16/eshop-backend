import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('checkout defaults DB: owner configuration, atomic revisions, validation and audit', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const currency = 'XTS'
  const prior = await f.db.checkoutDefaultRate.findUnique({
    where: { currency },
  })
  try {
    await f.db.checkoutDefaultRate.deleteMany({ where: { currency } })
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER'),
      admin = await f.account('ADMIN')
    const input = {
      currency,
      expectedRevision: 0,
      shippingMinor: 500,
      freeOverSubtotalMinor: 5000,
    }
    const endpoint = '/v1/admin/checkout/defaults'
    expect((await request.get(endpoint)).status()).toBe(401)
    for (const account of [customer, admin]) {
      expect(
        (
          await request.get(endpoint, { headers: bearer(account.token) })
        ).status(),
      ).toBe(403)
      expect(
        (
          await request.put(endpoint, {
            headers: bearer(account.token),
            data: input,
          })
        ).status(),
      ).toBe(403)
    }
    const headers = bearer(owner.token)
    const created = await request.put(endpoint, { headers, data: input })
    expect(created.status()).toBe(200)
    expect(await created.json()).toMatchObject({
      currency,
      shippingMinor: 500,
      freeOverSubtotalMinor: 5000,

      revision: 1,
    })
    expect(
      (await request.put(endpoint, { headers, data: input })).status(),
    ).toBe(409)
    const updates = await Promise.all([
      request.put(endpoint, {
        headers,
        data: { ...input, expectedRevision: 1, shippingMinor: 600 },
      }),
      request.put(endpoint, {
        headers,
        data: { ...input, expectedRevision: 1, shippingMinor: 700 },
      }),
    ])
    expect(updates.map((result) => result.status()).sort()).toEqual([200, 409])
    expect(
      (
        await f.db.checkoutDefaultRate.findUniqueOrThrow({
          where: { currency },
        })
      ).revision,
    ).toBe(2)
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'checkout.defaults.updated',
          targetId: currency,
        },
      }),
    ).toBe(2)
    const listed = await request.get(endpoint, { headers })
    expect(listed.status()).toBe(200)
    expect(await listed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency, revision: 2 }),
      ]),
    )
    expect(
      (
        await request.put(endpoint, {
          headers,
          data: { ...input, expectedRevision: 2, taxBps: 10001 },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.put(endpoint, {
          headers,
          data: { ...input, expectedRevision: 2, countryCode: 'BD' },
        })
      ).status(),
    ).toBe(400)
  } finally {
    await f.db.checkoutDefaultRate.deleteMany({ where: { currency } })
    if (prior) await f.db.checkoutDefaultRate.create({ data: prior })
    await f.close()
  }
})

test('delivery defaults DB: unconfigured destinations are free, overrides apply and final holds preserve price history', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const currency = 'XTS',
    countryCode = 'BD'
  const priorDefault = await f.db.checkoutDefaultRate.findUnique({
    where: { currency },
  })
  const priorRate = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    await f.db.checkoutDefaultRate.deleteMany({ where: { currency } })
    await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const ownerHeaders = bearer(owner.token),
      headers = bearer(customer.token)
    const category = await (
      await request.post('/v1/admin/categories', {
        headers: ownerHeaders,
        data: { name: 'Default delivery', slug: f.slug('delivery') },
      })
    ).json()
    const product = await (
      await request.post('/v1/admin/products', {
        headers: ownerHeaders,
        data: {
          title: 'Delivery item',
          slug: f.slug('item'),
          sku: f.sku('item'),
          priceMinor: 1000,
          stockOnHand: 5,
          currency,
          status: 'ACTIVE',
          categoryIds: [category.id],
        },
      })
    ).json()
    const items = [
      { id: randomUUID(), productId: product.id, variantId: null, quantity: 2 },
    ]
    const estimate = () =>
      request.post('/v1/checkout/estimate', {
        headers,
        data: { countryCode, items },
      })
    const options = () =>
      request.post('/v1/checkout/delivery-options', {
        headers,
        data: { countryCode, items },
      })
    const reserve = () =>
      request.post('/v1/checkout/reservations', {
        headers,
        data: { countryCode, items, requestId: randomUUID() },
      })
    const free = await estimate()
    expect(free.status()).toBe(200)
    expect(await free.json()).toMatchObject({
      shippingMinor: 0,
      taxMinor: 0,
      estimatedTotalMinor: 2000,
    })
    expect(await (await options()).json()).toMatchObject({
      options: [
        {
          label: 'Standard delivery',
          shippingMinor: 0,
          taxMinor: 0,
          totalMinor: 2000,
        },
      ],
    })
    const freeHold = await reserve()
    expect(freeHold.status()).toBe(200)
    const freeSnapshot = await freeHold.json()
    expect(freeSnapshot).toMatchObject({
      shippingMinor: 0,
      taxMinor: 0,
      estimatedTotalMinor: 2000,
    })
    await request.delete('/v1/checkout/reservations/' + freeSnapshot.id, {
      headers,
    })
    const input = {
      currency,
      expectedRevision: 0,
      shippingMinor: 500,
      freeOverSubtotalMinor: 5000,
    }
    expect(
      (
        await request.put('/v1/admin/checkout/defaults', {
          headers: ownerHeaders,
          data: input,
        })
      ).status(),
    ).toBe(200)
    expect(await (await estimate()).json()).toMatchObject({
      shippingMinor: 500,
      taxMinor: 0,
      estimatedTotalMinor: 2500,
    })
    const override = {
      countryCode,
      currency,
      enabled: true,
      shippingMinor: 300,
      freeOverSubtotalMinor: null,
    }
    expect(
      (
        await request.put('/v1/admin/checkout/rates', {
          headers: ownerHeaders,
          data: override,
        })
      ).status(),
    ).toBe(200)
    expect(await (await estimate()).json()).toMatchObject({
      shippingMinor: 300,
      taxMinor: 0,
      estimatedTotalMinor: 2300,
    })
    await request.put('/v1/admin/checkout/rates', {
      headers: ownerHeaders,
      data: { ...override, enabled: false },
    })
    expect(await (await estimate()).json()).toMatchObject({
      shippingMinor: 500,
      taxMinor: 0,
      estimatedTotalMinor: 2500,
    })
    const held = await reserve()
    expect(held.status()).toBe(200)
    const hold = await held.json()
    await request.put('/v1/admin/checkout/defaults', {
      headers: ownerHeaders,
      data: { ...input, expectedRevision: 1, shippingMinor: 800 },
    })
    expect(await (await estimate()).json()).toMatchObject({
      shippingMinor: 800,
      taxMinor: 0,
      estimatedTotalMinor: 2800,
    })
    expect(
      await (
        await request.get('/v1/checkout/reservations/' + hold.id, { headers })
      ).json(),
    ).toMatchObject({
      shippingMinor: 500,
      taxMinor: 0,
      estimatedTotalMinor: 2500,
    })
    // Represent a historical reservation carrying tax captured before its removal.
    await f.db.checkoutReservation.update({
      where: { id: hold.id },
      data: { taxMinor: 50, estimatedTotalMinor: 2550 },
    })
    const orderResponse = await request.post('/v1/orders', {
      headers,
      data: {
        requestId: randomUUID(),
        reservationId: hold.id,
        shippingAddress: {
          recipientName: 'Delivery Customer',
          phone: '+8801700000000',
          addressLine1: '1 Test Street',
          city: 'Dhaka',
          countryCode,
        },
      },
    })
    expect(orderResponse.status()).toBe(200)
    const order = await orderResponse.json()
    expect(order).toMatchObject({
      shippingMinor: 500,
      taxMinor: 50,
      totalMinor: 2550,
    })
    await request.post('/v1/orders/' + order.id + '/cancel', { headers })
    const shortage = await request.post('/v1/checkout/reservations', {
      headers,
      data: {
        countryCode,
        requestId: randomUUID(),
        items: [{ ...items[0], quantity: 6 }],
      },
    })
    expect(shortage.status()).toBe(409)
    expect(await shortage.json()).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      items: [{ requestedQuantity: 6, availableQuantity: 5 }],
    })
  } finally {
    await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.db.checkoutDefaultRate.deleteMany({ where: { currency } })
    if (priorRate) await f.db.checkoutRate.create({ data: priorRate })
    if (priorDefault)
      await f.db.checkoutDefaultRate.create({ data: priorDefault })
    await f.close()
  }
})
