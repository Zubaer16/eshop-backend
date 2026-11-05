import { expect, test } from '@playwright/test'
import { ReportingFixture, bearer } from '../api-tests/reporting-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('G10 Chromium: owner job status Swagger guarded and read-only (execution G12)', async ({
  page,
  request,
}) => {
  const fixture = new ReportingFixture(request)
  try {
    const owner = await fixture.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/jobs/status', 401)
    await authorizeInSwagger(page, owner.token)
    const result = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/jobs/status',
      200,
    )
    expect(await result.json()).toMatchObject({
      semantics: expect.any(String),
      schedules: expect.any(Array),
      lanes: expect.any(Object),
    })
    const failures = await request.get('/v1/admin/jobs/failures', {
      headers: bearer(owner.token),
    })
    expect(failures.status()).toBe(200)
    expect((await failures.json()).deliveryCaution).toContain('Never replay')
  } finally {
    await fixture.close()
  }
})
