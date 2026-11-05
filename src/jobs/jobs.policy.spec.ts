import {
  backoffSeconds,
  countProcessed,
  isJobLane,
  jobLanes,
  parseWorkerOptions,
} from './jobs.policy'
import { jobsConfiguration } from './jobs.config'

describe('G10 bounded scheduler and config policy (deferred to G12)', () => {
  it('fails closed with no automatic lanes or cron authentication', () => {
    expect(jobsConfiguration({})).toMatchObject({
      JOBS_CRON_ENABLED: false,
      JOBS_ALLOWED_LANES: [],
      JOBS_CRON_SECRET: '',
    })
    expect(() => jobsConfiguration({ JOBS_CRON_ENABLED: true })).toThrow()
    expect(() => jobsConfiguration({ JOBS_CRON_SECRET: 'short' })).toThrow()
    expect(() =>
      jobsConfiguration({ JOBS_ALLOWED_LANES: 'email.queue,email.queue' }),
    ).toThrow()
    expect(() =>
      jobsConfiguration({ JOBS_ALLOWED_LANES: 'unknown.worker' }),
    ).toThrow()
    expect(
      jobsConfiguration({ JOBS_ALLOWED_LANES: 'notifications.dispatch' })
        .JOBS_ALLOWED_LANES,
    ).toEqual(['notifications.dispatch'])
  })
  it('rejects unknown lane, implicit looping and unbounded intervals', () => {
    expect(jobLanes.length).toBeGreaterThan(10)
    expect(jobLanes.every((lane) => isJobLane(lane))).toBe(true)
    expect(() =>
      parseWorkerOptions(['--lane', 'refunds.send-directly']),
    ).toThrow()
    expect(() => parseWorkerOptions(['--loop'])).toThrow()
    expect(() => parseWorkerOptions(['--interval', '1', '--apply'])).toThrow()
    expect(() => parseWorkerOptions(['--interval', '9999'])).toThrow()
    expect(
      parseWorkerOptions(['--apply', '--lane', 'email.queue', '--loop']),
    ).toMatchObject({ apply: true, lane: 'email.queue', loop: true })
    expect(parseWorkerOptions([]).apply).toBe(false)
  })
  it('bounds backoff and only persists small nonnegative counters', () => {
    expect(backoffSeconds(1)).toBe(30)
    expect(backoffSeconds(2)).toBe(60)
    expect(backoffSeconds(100)).toBe(900)
    expect(countProcessed({ processed: 3, password: 'no' })).toBe(3)
    expect(countProcessed({ checked: 5 })).toBe(5)
    expect(countProcessed({ processed: -5 })).toBe(0)
    expect(countProcessed({ processed: 'secret' })).toBe(0)
  })
})
