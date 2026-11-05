import { JobsService } from './jobs.service'
import type { DatabaseService } from '../database/database.service'
import type { JobLane } from './jobs.policy'

/** Mock-only tests. Never contact Stripe, SMTP, FCM or PostgreSQL. */
function make(lanes: JobLane[] = ['notifications.dispatch']) {
  const state = { count: 0 }
  const client: {
    jobSchedule: {
      findMany: jest.Mock
      findUnique: jest.Mock
      updateMany: jest.Mock
    }
    jobRun: {
      updateMany: jest.Mock
      create: jest.Mock
    }
    $queryRaw: jest.Mock
    $transaction: jest.Mock
  } = {
    jobSchedule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ consecutiveFailures: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    jobRun: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'job-run' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  }
  const db = { client }
  const config = {
    get: jest.fn((key: string) =>
      key === 'JOBS_ALLOWED_LANES' ? lanes : 'disabled',
    ),
  }
  const notifications = {
    dispatch: jest.fn().mockImplementation(async () => {
      state.count++
      return { processed: 2 }
    }),
  }
  const unused = {} as never
  const jobs = new JobsService(
    db as unknown as DatabaseService,
    config as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    notifications as never,
    unused,
    unused,
    unused,
    unused,
    unused,
  )
  return { jobs, db, config, notifications, state }
}
describe('durable jobs native-worker coordination (deferred to release acceptance)', () => {
  it('does not do writes or invoke workers in preview', async () => {
    const { jobs, db, notifications } = make()
    expect(await jobs.tick('WORKER', undefined, false)).toMatchObject({
      apply: false,
    })
    expect(db.client.$queryRaw).not.toHaveBeenCalled()
    expect(notifications.dispatch).not.toHaveBeenCalled()
  })
  it('does not invoke a worker if another process owns the lease', async () => {
    const { jobs, db, notifications } = make()
    const result = await jobs.tick('WORKER', 'notifications.dispatch', true)
    expect(result).toMatchObject({
      apply: true,
      outcomes: [{ status: 'SKIPPED_LEASED_OR_NOT_DUE' }],
    })
    expect(notifications.dispatch).not.toHaveBeenCalled()
    expect(db.client.jobRun.create).not.toHaveBeenCalled()
  })
  it('requires explicit deployment allowlist even when --apply is provided', async () => {
    const { jobs, db } = make([])
    await expect(jobs.tick('WORKER', 'email.dispatch', true)).rejects.toThrow()
    expect(db.client.$queryRaw).not.toHaveBeenCalled()
  })
  it('stores only summary counters after a claimed native worker completes', async () => {
    const { jobs, db, notifications } = make()
    db.client.$queryRaw.mockResolvedValue([{ lane: 'notifications.dispatch' }])
    const result = await jobs.tick('WORKER', 'notifications.dispatch', true)
    expect(result).toMatchObject({
      outcomes: [{ status: 'SUCCEEDED', processed: 2 }],
    })
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.any(Date),
      40,
      true,
    )
    expect(db.client.jobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          processed: 2,
          errorCode: null,
        }),
      }),
    )
  })
})
