import { test, expect } from '@playwright/test'
test('web order pages have explicit response contracts and keep recovery financial/physical actions separate', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const [path, schema] of [
    ['/v1/orders', 'CustomerOrderPageDto'],
    ['/v1/admin/orders', 'AdminOrderPageDto'],
    ['/v1/admin/orders/{id}', 'AdminOrderDetailDto'],
  ] as const) {
    expect(
      doc.paths[path].get.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/' + schema)
  }
  expect(
    doc.components.schemas.OrderResponseDto.properties.createdAt.format,
  ).toBe('date-time')
  expect(
    doc.components.schemas.AdminOrderSummaryDto.properties,
  ).not.toHaveProperty('shippingAddress')
  expect(
    doc.components.schemas.AdminOrderDetailDto.properties,
  ).not.toHaveProperty('requestHash')
  expect(
    Object.keys(doc.components.schemas.CreateOrderReturnDto.properties).sort(),
  ).toEqual(['orderLineId', 'quantity', 'reason', 'requestId'])
  expect(
    Object.keys(
      doc.components.schemas.CreateRefundRequestDto.properties,
    ).sort(),
  ).toEqual(['amountMinor', 'reason', 'requestId'])
  expect(doc.paths['/v1/orders/{id}/tracking'].get.security).toEqual(
    expect.arrayContaining([{ 'access-token': [] }]),
  )
  expect(doc.paths['/v1/admin/orders/{id}/returns'].post).toBeUndefined()
  expect((await request.get('/v1/orders')).status()).toBe(401)
  expect((await request.get('/v1/admin/orders')).status()).toBe(401)
})
