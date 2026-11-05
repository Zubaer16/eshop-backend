import { expect, test } from '@playwright/test'

test('promotions OpenAPI: coupon/campaign RBAC, single-code checkout, discount snapshots and private campaign notes', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const entity of ['coupons', 'campaigns']) {
    for (const [method, path] of [
      ['get', '/v1/admin/promotions/' + entity],
      ['post', '/v1/admin/promotions/' + entity],
      ['get', '/v1/admin/promotions/' + entity + '/{id}'],
      ['put', '/v1/admin/promotions/' + entity + '/{id}'],
      ['delete', '/v1/admin/promotions/' + entity + '/{id}'],
    ]) {
      const op = doc.paths[path!][method!]
      expect(op.tags).toEqual(['Promotions / Admin'])
      expect(op.security).toContainEqual({ 'access-token': [] })
      for (const code of ['401', '403', '400', '409'])
        expect(op.responses).toHaveProperty(code)
    }
  }
  const publicOp = doc.paths['/v1/promotions/campaigns'].get
  expect(publicOp.security ?? []).toEqual([])
  expect(publicOp.responses).toHaveProperty('503')
  const publicKeys = Object.keys(
    doc.components.schemas.PublicPromotionCampaignDto.properties,
  ).sort()
  expect(publicKeys).toEqual(['endsAt', 'id', 'slug', 'startsAt', 'title'])
  for (const name of ['CheckoutEstimateDto', 'CreateReservationDto']) {
    expect(doc.components.schemas[name].properties).toHaveProperty('couponCode')
    expect(doc.components.schemas[name].required).not.toContain('couponCode')
  }
  for (const name of [
    'CheckoutEstimateResponseDto',
    'CheckoutReservationResponseDto',
    'OrderResponseDto',
  ])
    for (const field of ['discountMinor', 'couponCode', 'couponSnapshot'])
      expect(doc.components.schemas[name].properties).toHaveProperty(field)
  expect((await request.get('/v1/promotions/campaigns')).status()).toBe(503)
  expect((await request.get('/v1/admin/promotions/coupons')).status()).toBe(401)
})
