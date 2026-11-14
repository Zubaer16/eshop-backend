import { expect, test } from '@playwright/test'

test('store operations Swagger: public config and OWNER-only zone/operations contracts', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [method, path, tag, secure] of [
    ['get', '/v1/store/operations', 'Store Operations / Public', false],
    ['get', '/v1/admin/store/operations', 'Store Operations / Admin', true],
    ['put', '/v1/admin/store/operations', 'Store Operations / Admin', true],
    ['get', '/v1/admin/checkout/zones', 'Delivery Zones / Admin', true],
    ['post', '/v1/admin/checkout/zones', 'Delivery Zones / Admin', true],
    ['put', '/v1/admin/checkout/zones/{id}', 'Delivery Zones / Admin', true],
    ['delete', '/v1/admin/checkout/zones/{id}', 'Delivery Zones / Admin', true],
    ['post', '/v1/checkout/delivery-options', 'Checkout / Customer', true],
  ] as const) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.tags).toContain(tag)
    if (secure)
      expect(op.security).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'access-token': [] }),
        ]),
      )
    else expect(op.security || []).toEqual([])
  }
  expect(
    doc.components.schemas.PutStoreOperationsDto.properties,
  ).toHaveProperty('expectedRevision')
  expect(doc.components.schemas.SaveDeliveryZoneDto.properties).toHaveProperty(
    'services',
  )
  expect(doc.components.schemas.CheckoutEstimateDto.properties).toHaveProperty(
    'deliveryKind',
  )
  expect(doc.components.schemas.CreateReservationDto.properties).toHaveProperty(
    'deliveryKind',
  )
  expect(doc.paths['/v1/store/operations'].get.responses['503']).toBeDefined()
  // The smoke server has no database. Actual public configuration is verified
  // by the guarded PostgreSQL suite; unavailable storage must not fabricate it.
  expect((await request.get('/v1/store/operations')).status()).toBe(503)
  expect((await request.get('/v1/admin/store/operations')).status()).toBe(401)
  expect(
    (
      await request.post('/v1/checkout/delivery-options', {
        data: { countryCode: 'AQ' },
      })
    ).status(),
  ).toBe(401)
  expect(
    (await request.post('/v1/admin/checkout/zones', { data: {} })).status(),
  ).toBe(401)
})
