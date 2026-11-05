import { expect, test } from '@playwright/test'
import { ReportingFixture, bearer } from './reporting-test-support'

test('G10 owner job surfaces fail closed to anonymous, customer and staff (execution G12)', async ({
  request,
}) => {
  const fixture = new ReportingFixture(request)
  try {
    const customer = await fixture.account('CUSTOMER')
    const staff = await fixture.account('STAFF')
    const owner = await fixture.account('OWNER')
    for (const path of [
      '/v1/admin/jobs/status',
      '/v1/admin/jobs/runs',
      '/v1/admin/jobs/failures',
    ]) {
      expect((await request.get(path)).status()).toBe(401)
      expect(
        (await request.get(path, { headers: bearer(customer.token) })).status(),
      ).toBe(403)
      expect(
        (await request.get(path, { headers: bearer(staff.token) })).status(),
      ).toBe(403)
      const response = await request.get(path, { headers: bearer(owner.token) })
      expect(response.status()).toBe(200)
      const text = await response.text()
      for (const field of [
        'tokenCiphertext',
        'passwordHash',
        'smtpPassword',
        'payload',
      ])
        expect(text).not.toContain(field)
    }
    expect(
      (
        await request.post(
          '/v1/admin/jobs/retry-notification/3806b123-3e58-4acc-942a-5213909e23fc',
        )
      ).status(),
    ).toBe(401)
  } finally {
    await fixture.close()
  }
})

test('G10 cron does not allow unauthenticated scheduled execution (execution G12)', async ({
  request,
}) => {
  const response = await request.get('/v1/internal/jobs/tick')
  expect([401, 503]).toContain(response.status())
})
