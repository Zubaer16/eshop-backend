import { expect, test } from '@playwright/test'
test('reporting OpenAPI: guarded typed reports, exact aggregates and bounded audited CSV contract (execution release acceptance)', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const path of [
    '/v1/admin/reports/financial',
    '/v1/admin/reports/daily',
    '/v1/admin/reports/orders',
    '/v1/admin/reports/payments',
    '/v1/admin/reports/products',
    '/v1/admin/reports/customers',
    '/v1/admin/reports/inventory',
    '/v1/admin/reports/export/{kind}',
    '/v1/admin/activity',
    '/v1/admin/dashboard/overview',
  ]) {
    const op = doc.paths[path].get
    expect(op.security).toContainEqual({ 'access-token': [] })
    for (const status of ['400', '401', '403', '503'])
      expect(op.responses).toHaveProperty(status)
  }
  expect(
    doc.components.schemas.CurrencyCollectionDto.properties.paidMinor.type,
  ).toBe('string')
  expect(
    Object.keys(doc.components.schemas.ActivityRowDto.properties).sort(),
  ).toEqual(['action', 'actorId', 'createdAt', 'id', 'targetId', 'targetType'])
  for (const schema of [
    'ReportPaymentDto',
    'ReportOrderDto',
    'CustomerPerformanceDto',
  ])
    for (const field of [
      'providerIntentId',
      'passwordHash',
      'shippingAddress',
      'phone',
      'tokenHash',
      'payload',
    ])
      expect(doc.components.schemas[schema].properties).not.toHaveProperty(
        field,
      )
  expect(
    doc.paths['/v1/admin/reports/export/{kind}'].get.responses['200'].content,
  ).toHaveProperty('text/csv')
  for (const path of [
    '/v1/admin/reports/financial',
    '/v1/admin/dashboard/overview',
    '/v1/admin/activity',
  ])
    expect((await request.get(path)).status()).toBe(401)
})
