import { test, expect } from '@playwright/test'
test('web shopping contract keeps guest capability distinct, cart totals nonpayable and customer directory free of private address data', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  expect(
    doc.paths['/v1/guest-cart'].delete.responses['200'].content[
      'application/json'
    ].schema.$ref,
  ).toBe('#/components/schemas/GuestCartRevokedDto')
  expect(
    doc.components.schemas.GuestCartRevokedDto.properties.revoked.type,
  ).toBe('boolean')
  expect(doc.paths['/v1/guest-cart'].get.security).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ 'guest-cart-token': [] }),
    ]),
  )
  expect(doc.paths['/v1/cart/merge'].post.security).toEqual(
    expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
  )
  expect(
    doc.components.schemas.CartQuoteResponseDto.properties.amountDueMinor
      .nullable,
  ).toBe(true)
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
