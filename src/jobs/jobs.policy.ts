/** G10 coordinates existing workers. It does NOT replace their dedupe or provider state machines. */
export const jobLanes = [
  'checkout.reservations',
  'checkout.orders',
  'payments.reconcile',
  'payments.cancel',
  'refunds.execute',
  'media.reconcile',
  'media.renditions',
  'media.cleanup',
  'notifications.dispatch',
  'email.queue',
  'email.dispatch',
  'push.campaigns',
  'push.queue',
  'push.dispatch',
  'devices.expire',
  'jobs.retention',
] as const
export type JobLane = (typeof jobLanes)[number]
export const isJobLane = (x: string): x is JobLane =>
  (jobLanes as readonly string[]).includes(x)

// Each invocation executes a single bounded batch. No uncontrolled drains.
export const jobCadenceSeconds: Record<JobLane, number> = {
  'checkout.reservations': 60,
  'checkout.orders': 60,
  'payments.reconcile': 120,
  'payments.cancel': 120,
  'refunds.execute': 120,
  'media.reconcile': 900,
  'media.renditions': 180,
  'media.cleanup': 300,
  'notifications.dispatch': 60,
  'email.queue': 60,
  'email.dispatch': 60,
  'push.campaigns': 60,
  'push.queue': 60,
  'push.dispatch': 60,
  'devices.expire': 3600,
  'jobs.retention': 86400,
}
export const jobSourceEpoch = new Date('2000-01-01T00:00:00.000Z')
export function parseWorkerOptions(args: string[]) {
  let apply = false
  let loop = false
  let lane: JobLane | undefined
  let interval = 30
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--apply') apply = true
    else if (arg === '--loop') loop = true
    else if (arg === '--lane') {
      const value = args[++i] ?? ''
      if (!isJobLane(value)) throw new Error('Unknown G10 job lane')
      lane = value
    } else if (arg === '--interval') interval = Number(args[++i])
    else throw new Error('Unknown G10 worker option')
  }
  if (!Number.isInteger(interval) || interval < 15 || interval > 3600)
    throw new Error('Use --interval 15..3600')
  if (loop && !apply) throw new Error('Loop requires explicit --apply')
  return { apply, loop, lane, interval }
}

/** Only bounded nonnegative counts may appear in G10 run metadata. */
export function countProcessed(result: unknown): number {
  if (typeof result === 'number')
    return Number.isSafeInteger(result) && result > 0 ? result : 0
  if (!result || typeof result !== 'object') return 0
  const entry = result as Record<string, unknown>
  for (const key of [
    'processed',
    'completed',
    'accepted',
    'expired',
    'checked',
    'queued',
    'enqueued',
    'candidates',
  ]) {
    const value = entry[key]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      return Math.min(value, 1000000)
  }
  return 0
}

export function backoffSeconds(failures: number): number {
  return Math.min(900, 30 * 2 ** Math.min(5, Math.max(0, failures - 1)))
}
