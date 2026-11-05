import { expect, test } from '@playwright/test'
import { ReportingFixture } from './reporting-test-support'

test('G10 DB: additive scheduler metadata and bounded telemetry are isolated (execution G12)', async ({
  request,
}) => {
  const fixture = new ReportingFixture(request)
  const lane = 'g10-db-contract-fixture'
  try {
    await fixture.db.jobSchedule.deleteMany({ where: { lane } })
    const inserted = await fixture.db.jobSchedule.create({
      data: { lane, nextRunAt: new Date() },
    })
    expect(inserted.leaseToken).toBeNull()
    expect(inserted.consecutiveFailures).toBe(0)
    const run = await fixture.db.jobRun.create({
      data: {
        lane,
        leaseToken: 'f19b233c-a8cf-4e91-96e8-d02f7c7a1405',
        trigger: 'WORKER',
        status: 'RUNNING',
      },
    })
    const changed = await fixture.db.jobRun.updateMany({
      where: { id: run.id, status: 'RUNNING' },
      data: {
        status: 'ABANDONED',
        errorCode: 'LEASE_EXPIRED',
        finishedAt: new Date(),
      },
    })
    expect(changed.count).toBe(1)
    expect(
      (await fixture.db.jobRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('ABANDONED')
  } finally {
    await fixture.db.jobRun.deleteMany({ where: { lane } })
    await fixture.db.jobSchedule.deleteMany({ where: { lane } })
    await fixture.close()
  }
})
