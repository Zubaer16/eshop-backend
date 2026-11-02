import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05B-5 Swagger Chromium: OWNER store ops and zone permission Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    const pub = await swaggerExecute(page, 'GET', '/v1/store/operations', 200)
    expect(await pub.json()).toMatchObject({
      guestCheckoutEnabled: false,
      guestCartEnabled: true,
    })
    await swaggerExecute(page, 'GET', '/v1/admin/store/operations', 401)
    await swaggerExecute(page, 'GET', '/v1/admin/checkout/zones', 401)
    await authorizeInSwagger(page, owner.token)
    const operations = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/store/operations',
      200,
    )
    expect((await operations.json()).deploymentCorsOrigins).toBeInstanceOf(
      Array,
    )
    const zones = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/checkout/zones',
      200,
    )
    expect(await zones.json()).toBeInstanceOf(Array)
  } finally {
    await f.close()
  }
})
