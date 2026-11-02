import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const operations = {
  locale: 'en-US',
  displayCurrency: 'USD',
  orderPrefix: 'KB',
  themeMode: 'system',
  accentColor: '#1F2937',
  storefrontOrigin: 'https://shop.example.com',
  adminOrigin: 'https://admin.example.com',
  showWishlist: true,
  showPolicies: true,
}
const zone = {
  expectedRevision: 0,
  name: 'Security Test Zone',
  currency: 'USD',
  countries: ['AQ'],
  enabled: true,
  services: [
    {
      kind: 'standard',
      shippingMinor: 100,
      freeOverSubtotalMinor: null,
      etaNote: '',
      enabled: true,
    },
    {
      kind: 'express',
      shippingMinor: 200,
      freeOverSubtotalMinor: null,
      etaNote: '',
      enabled: false,
    },
  ],
}

test('05B-5 security: OWNER-only, strict metadata, denied guest checkout', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const before = await f.db.storeOperations.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const admin = await f.account('ADMIN')
    for (const actor of [customer, admin]) {
      await assertSafeError(
        await request.put('/v1/admin/store/operations', {
          headers: bearer(actor.token),
          data: { ...operations, expectedRevision: 0 },
        }),
        403,
      )
      await assertSafeError(
        await request.post('/v1/admin/checkout/zones', {
          headers: bearer(actor.token),
          data: zone,
        }),
        403,
      )
    }
    await assertSafeError(
      await request.put('/v1/admin/store/operations', {
        data: { ...operations, expectedRevision: 0 },
      }),
      401,
    )
    const beforeAdmin = await request.get('/v1/admin/store/operations', {
      headers: bearer(owner.token),
    })
    const revision = (await beforeAdmin.json()).revision as number
    for (const bad of [
      { storefrontOrigin: 'http://shop.example.com' },
      { storefrontOrigin: 'https://shop.example.com/path' },
      { storefrontOrigin: 'https://shop.example.com@127.0.0.1' },
      { storefrontOrigin: 'https://localhost' },
      { adminOrigin: 'https://shop.example.com' },
      { guestCheckoutEnabled: true },
      { accentColor: 'var(--arbitrary-css)' },
      { role: 'OWNER' },
    ]) {
      await assertSafeError(
        await request.put('/v1/admin/store/operations', {
          headers: bearer(owner.token),
          data: { ...operations, expectedRevision: revision, ...bad },
        }),
        400,
      )
    }
    for (const bad of [
      { countries: ['AQ', 'AQ'] },
      { services: [zone.services[0], zone.services[0]] },
      {
        services: [
          { ...zone.services[0], shippingMinor: -10 },
          zone.services[1],
        ],
      },
      { role: 'OWNER' },
    ]) {
      await assertSafeError(
        await request.post('/v1/admin/checkout/zones', {
          headers: bearer(owner.token),
          data: { ...zone, ...bad },
        }),
        400,
      )
    }
    expect(
      await f.db.storeOperations.findUnique({ where: { key: 'primary' } }),
    ).toEqual(before)
    const publicConfig = await (
      await request.get('/v1/store/operations')
    ).json()
    expect(publicConfig).toMatchObject({
      guestCheckoutEnabled: false,
      guestCartEnabled: true,
    })
    expect(JSON.stringify(publicConfig)).not.toMatch(
      /adminOrigin|deploymentCorsOrigins|orderPrefix|revision/,
    )
    await assertSafeError(
      await request.post('/v1/checkout/estimate', {
        data: { countryCode: 'AQ' },
      }),
      401,
    )
    await assertSafeError(
      await request.post('/v1/checkout/reservations', {
        data: { countryCode: 'AQ' },
      }),
      401,
    )
    await assertSafeError(
      await request.post('/v1/orders', { data: { countryCode: 'AQ' } }),
      401,
    )
  } finally {
    if (before)
      await f.db.storeOperations.upsert({
        where: { key: 'primary' },
        create: { ...before },
        update: { ...before },
      })
    else await f.db.storeOperations.deleteMany({ where: { key: 'primary' } })
    await f.close()
  }
})
