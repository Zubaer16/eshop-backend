import { expect, test } from '@playwright/test'
test('durable jobs OpenAPI owner operations; cron secret never appears in schema (execution release acceptance)', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  for (const path of [
    '/v1/admin/jobs/status',
    '/v1/admin/jobs/runs',
    '/v1/admin/jobs/failures',
  ]) {
    const op = doc.paths[path]?.get
    expect(op).toBeTruthy()
    expect(op.security).toContainEqual({ 'access-token': [] })
    for (const status of ['401', '403', '503'])
      expect(op.responses).toHaveProperty(status)
  }
  expect(
    doc.paths['/v1/admin/jobs/retry-notification/{id}']?.post.security,
  ).toContainEqual({ 'access-token': [] })
  expect(doc.paths).not.toHaveProperty('/v1/internal/jobs/tick')
  expect(JSON.stringify(doc)).not.toContain('JOBS_CRON_SECRET')
})
