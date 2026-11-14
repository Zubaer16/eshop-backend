import { test, expect } from '@playwright/test'
test('web shopping contract accepts browser cart items and keeps customer directory free of private address data', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const path of Object.keys(doc.paths))
    expect(path).not.toMatch(/^\/v1\/(cart|guest-cart)(\/|$)/)
  for (const path of ['/v1/cart', '/v1/guest-cart'])
    expect((await request.get(path)).status()).toBe(404)
  const checkout = doc.components.schemas.StartHostedCheckoutDto.properties
  expect(checkout.items).toMatchObject({
    type: 'array',
    minItems: 1,
    maxItems: 50,
  })
  const profile = doc.components.schemas.UpdateCustomerProfileDto.properties
  expect(Object.keys(profile)).toEqual(['displayName'])
  for (const key of [
    'addresses',
    'phone',
    'addressLine1',
    'passwordHash',
    'refreshToken',
    'totalSpent',
  ])
    expect(
      doc.components.schemas.AdminCustomerDetailDto.properties,
    ).not.toHaveProperty(key)
  for (const key of ['savedAddressCount', 'recentOrders', 'orderCount'])
    expect(
      doc.components.schemas.AdminCustomerDetailDto.properties,
    ).toHaveProperty(key)
})
