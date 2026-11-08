import { test, expect } from '@playwright/test'
test('web checkout discovery is customer guarded and documented without address or provider secrets', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  const route = doc.paths['/v1/checkout/recovery'].get
  expect(route.security).toEqual(
    expect.arrayContaining([{ 'access-token': [] }]),
  )
  expect(route.responses['200'].content['application/json'].schema.$ref).toBe(
    '#/components/schemas/CheckoutRecoveryResponseDto',
  )
  expect(
    Object.keys(
      doc.components.schemas.CheckoutRecoveryResponseDto.properties,
    ).sort(),
  ).toEqual(['orderId', 'reservation'])
  expect((await request.get('/v1/checkout/recovery')).status()).toBe(401)
  expect(
    doc.paths['/v1/admin/checkout/rates'].get.responses['200'].content[
      'application/json'
    ].schema.items.$ref,
  ).toBe('#/components/schemas/CheckoutRateResponseDto')
  const input = doc.components.schemas.CreateOrderDto.properties
  expect(Object.keys(input).sort()).toEqual([
    'requestId',
    'reservationId',
    'shippingAddress',
  ])
  expect(
    doc.components.schemas.PaymentPreparationResponseDto.properties,
  ).not.toHaveProperty('clientSecret')
})
