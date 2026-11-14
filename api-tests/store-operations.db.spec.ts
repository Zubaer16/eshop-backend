import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const operations = {
  locale: 'bn-BD',
  displayCurrency: 'BDT',
  orderPrefix: 'TEST',
  themeMode: 'dark',
  accentColor: '#f17224',
  storefrontOrigin: 'https://store.example.org',
  adminOrigin: 'https://admin.example.org',
  showWishlist: false,
  showPolicies: true,
}

const zone = {
  expectedRevision: 0,
  name: 'QA Antarctic ' + randomUUID().slice(0, 8),
  currency: 'USD',
  countries: ['AQ', 'BV'],
  enabled: true,
  services: [
    {
      kind: 'standard',
      shippingMinor: 150,
      freeOverSubtotalMinor: 1500,
      etaNote: 'ETA unconfirmed',
      enabled: true,
    },
    {
      kind: 'express',
      shippingMinor: 350,
      freeOverSubtotalMinor: null,
      etaNote: 'Express preview',
      enabled: true,
    },
  ],
}

test('store operations DB: revisioned operations with safe public defaults, immutable audit', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeOperations.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const existing = await request.get('/v1/admin/store/operations', {
      headers: bearer(owner.token),
    })
    expect(existing.status()).toBe(200)
    const revision = (await existing.json()).revision as number
    const saved = await request.put('/v1/admin/store/operations', {
      headers: bearer(owner.token),
      data: { ...operations, expectedRevision: revision },
    })
    expect(saved.status()).toBe(200)
    expect(await saved.json()).toMatchObject({
      configured: true,
      revision: revision + 1,
      orderPrefix: 'TEST',
    })
    const publicResponse = await request.get('/v1/store/operations')
    expect(publicResponse.status()).toBe(200)
    const pub = await publicResponse.json()
    expect(pub).toMatchObject({
      configured: true,
      locale: 'bn-BD',
      displayCurrency: 'BDT',
      themeMode: 'dark',
      accentColor: '#F17224',
      showWishlist: false,
      guestCheckoutEnabled: false,
    })
    expect(pub).not.toHaveProperty('adminOrigin')
    expect(pub).not.toHaveProperty('orderPrefix')
    expect(
      (
        await request.put('/v1/admin/store/operations', {
          headers: bearer(owner.token),
          data: { ...operations, expectedRevision: revision },
        })
      ).status(),
    ).toBe(409)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'store.operations.updated' },
      }),
    ).toBe(1)
  } finally {
    if (previous)
      await f.db.storeOperations.upsert({
        where: { key: 'primary' },
        create: { ...previous },
        update: { ...previous },
      })
    else await f.db.storeOperations.deleteMany({ where: { key: 'primary' } })
    await f.close()
  }
})

test('store operations DB: country/service quote->hold->order snapshots; legacy lane retained', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const countryCode = 'AQ',
    currency = 'USD'
  let zoneId: string | null = null
  const formerRate = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const ownerAuth = bearer(owner.token)
    const customerAuth = bearer(customer.token)
    const category = await request.post('/v1/admin/categories', {
      headers: ownerAuth,
      data: { name: 'Store operations test', slug: f.slug('ops') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: ownerAuth,
      data: {
        title: 'Store operations test product',
        slug: f.slug('ops-p'),
        sku: f.sku('ops'),
        priceMinor: 1299,
        currency,
        stockOnHand: 3,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId: string = (await product.json()).id
    f.selectItems(customerAuth, { productId, quantity: 1 })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 99,
        taxBps: 1000,
        enabled: true,
      },
      update: {
        shippingMinor: 99,
        freeOverSubtotalMinor: null,
        taxBps: 1000,
        enabled: true,
      },
    })
    const quote = (deliveryKind?: string) =>
      request.post('/v1/checkout/estimate', {
        headers: customerAuth,
        data: {
          ...(deliveryKind ? { countryCode, deliveryKind } : { countryCode }),
          items: f.selections(customerAuth),
        },
      })
    // Old flat-rate lanes remain valid until a zone is configured.
    expect(await (await quote()).json()).toMatchObject({
      shippingMinor: 99,
      deliveryKind: null,
    })
    expect((await quote('express')).status()).toBe(422)
    const created = await request.post('/v1/admin/checkout/zones', {
      headers: ownerAuth,
      data: zone,
    })
    expect(created.status()).toBe(201)
    const saved = await created.json()
    zoneId = saved.id
    expect(saved).toMatchObject({
      revision: 1,
      currency,
      countries: ['AQ', 'BV'],
    })
    expect(
      (
        await request.post('/v1/admin/checkout/zones', {
          headers: ownerAuth,
          data: { ...zone, name: 'Other Shipping Zone' },
        })
      ).status(),
    ).toBe(409)
    const available = await request.post('/v1/checkout/delivery-options', {
      headers: customerAuth,
      data: { ...{ countryCode }, items: f.selections(customerAuth) },
    })
    expect(available.status()).toBe(200)
    expect(await available.json()).toMatchObject({
      countryCode,
      currency,
      subtotalMinor: 1299,
      guestCheckoutEnabled: false,
      options: expect.arrayContaining([
        expect.objectContaining({
          kind: 'express',
          shippingMinor: 350,
          taxMinor: 130,
          totalMinor: 1779,
        }),
        expect.objectContaining({
          kind: 'standard',
          shippingMinor: 150,
          taxMinor: 130,
          totalMinor: 1579,
        }),
      ]),
    })
    expect(await (await quote()).json()).toMatchObject({
      deliveryKind: 'standard',
      shippingMinor: 150,
      taxMinor: 130,
      estimatedTotalMinor: 1579,
    })
    expect(await (await quote('express')).json()).toMatchObject({
      deliveryKind: 'express',
      shippingMinor: 350,
      taxMinor: 130,
      estimatedTotalMinor: 1779,
    })
    // The configured threshold applies to standard only; express retains its fee.
    f.selectItems(customerAuth, { productId, quantity: 2 })
    expect(await (await quote('standard')).json()).toMatchObject({
      subtotalMinor: 2598,
      shippingMinor: 0,
      taxMinor: 260,
      estimatedTotalMinor: 2858,
    })
    expect(await (await quote('express')).json()).toMatchObject({
      subtotalMinor: 2598,
      shippingMinor: 350,
      taxMinor: 260,
      estimatedTotalMinor: 3208,
    })
    f.selectItems(customerAuth, { productId, quantity: 1 })
    const requestId = randomUUID()
    const reserved = await request.post('/v1/checkout/reservations', {
      headers: customerAuth,
      data: {
        ...{ requestId, countryCode, deliveryKind: 'express' },
        items: f.selections(customerAuth),
      },
    })
    expect(reserved.status()).toBe(200)
    const hold = await reserved.json()
    expect(hold).toMatchObject({
      deliveryKind: 'express',
      shippingMinor: 350,
      taxMinor: 130,
      estimatedTotalMinor: 1779,
    })
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers: customerAuth,
          data: {
            ...{ requestId, countryCode, deliveryKind: 'standard' },
            items: f.selections(customerAuth),
          },
        })
      ).status(),
    ).toBe(409)
    // Changes to zone do not reprice a previously held order.
    const change = {
      ...zone,
      expectedRevision: 1,
      services: zone.services.map((s) =>
        s.kind === 'express' ? { ...s, shippingMinor: 900 } : s,
      ),
    }
    const competingEdits = await Promise.all([
      request.put(`/v1/admin/checkout/zones/${zoneId}`, {
        headers: ownerAuth,
        data: change,
      }),
      request.put(`/v1/admin/checkout/zones/${zoneId}`, {
        headers: ownerAuth,
        data: change,
      }),
    ])
    expect(competingEdits.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ])
    expect(
      (
        await request.put(`/v1/admin/checkout/zones/${zoneId}`, {
          headers: ownerAuth,
          data: { ...zone, expectedRevision: 1 },
        })
      ).status(),
    ).toBe(409)
    const order = await request.post('/v1/orders', {
      headers: customerAuth,
      data: {
        requestId: randomUUID(),
        reservationId: hold.id,
        shippingAddress: {
          recipientName: 'QA Order',
          phone: '+12025550120',
          addressLine1: '10 Example St',
          city: 'Test',
          countryCode,
        },
      },
    })
    expect(order.status()).toBe(200)
    expect(await order.json()).toMatchObject({
      deliveryKind: 'express',
      shippingMinor: 350,
      taxMinor: 130,
      totalMinor: 1779,
    })
    const dbOrder = await f.db.order.findUniqueOrThrow({
      where: { id: (await order.json()).id },
    })
    expect(dbOrder.deliveryKind).toBe('EXPRESS')
    // A disabled assigned zone blocks quotes; it must not fall back to legacy rates.
    const disabled = await request.put(`/v1/admin/checkout/zones/${zoneId}`, {
      headers: ownerAuth,
      data: { ...zone, expectedRevision: 2, enabled: false },
    })
    expect(disabled.status()).toBe(200)
    expect((await quote()).status()).toBe(422)
    // Deleting zone does not delete financial history or change saved order totals.
    expect(
      (
        await request.delete(`/v1/admin/checkout/zones/${zoneId}`, {
          headers: ownerAuth,
          params: { expectedRevision: 3 },
        })
      ).status(),
    ).toBe(200)
    zoneId = null
    expect(
      (
        await request.get('/v1/orders/' + dbOrder.id, { headers: customerAuth })
      ).status(),
    ).toBe(200)
    expect((await quote()).status()).toBe(200)
    expect(await (await quote()).json()).toMatchObject({
      shippingMinor: 99,
      deliveryKind: null,
    })
  } finally {
    if (zoneId) await f.db.deliveryZone.deleteMany({ where: { id: zoneId } })
    if (formerRate)
      await f.db.checkoutRate.upsert({
        where: { countryCode_currency: { countryCode, currency } },
        create: { ...formerRate },
        update: { ...formerRate },
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
