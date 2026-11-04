import { expect, test } from '@playwright/test'
import {
  ReportingFixture,
  bearer,
  range,
} from '../api-tests/reporting-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'
test('G9 Swagger Chromium: verified financial/SKU dashboard reports, audit metadata and protected export (execution G12)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      order = await f.order(owner)
    await f.settle(order)
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/reports/financial', 401)
    await authorizeInSwagger(page, owner.token)
    const financial = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/reports/financial',
      200,
      undefined,
      undefined,
      { ...range, currency: 'USD' },
    )
    expect((await financial.json()).byCurrency).toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'USD' })]),
    )
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/reports/daily',
      200,
      undefined,
      undefined,
      { ...range, currency: 'USD' },
    )
    const products = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/reports/products',
      200,
      undefined,
      undefined,
      { ...range, currency: 'USD', productId: order.productId },
    )
    expect(await products.json()).toMatchObject({ total: 1 })
    const dashboard = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/dashboard/overview',
      200,
      undefined,
      undefined,
      { ...range, currency: 'USD' },
    )
    expect(await dashboard.json()).toMatchObject({
      available: { financial: true, inventory: true },
    })
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/activity',
      200,
      undefined,
      undefined,
      { ...range, actorId: owner.id },
    )
    const csv = await request.get('/v1/admin/reports/export/products', {
      headers: bearer(owner.token),
      params: { ...range, currency: 'USD', productId: order.productId },
    })
    expect(csv.status()).toBe(200)
    expect(csv.headers()['x-export-row-count']).toBe('1')
  } finally {
    await f.close()
  }
})
