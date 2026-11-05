import { jobLanes, isJobLane, type JobLane } from './jobs.policy'

export type JobsConfig = {
  JOBS_CRON_ENABLED: boolean
  JOBS_CRON_SECRET: string
  JOBS_ALLOWED_LANES: JobLane[]
}
export function jobsConfiguration(raw: Record<string, unknown>): JobsConfig {
  const enabled = raw.JOBS_CRON_ENABLED ?? 'false'
  if (![true, false, 'true', 'false'].includes(enabled as string | boolean))
    throw new Error('JOBS_CRON_ENABLED must be true or false')
  const secret =
    typeof raw.JOBS_CRON_SECRET === 'string' ? raw.JOBS_CRON_SECRET : ''
  if (
    secret &&
    (secret.length < 48 || secret.length > 512 || /\s/.test(secret))
  )
    throw new Error(
      'JOBS_CRON_SECRET must be 48..512 non-whitespace characters',
    )
  const rawList = raw.JOBS_ALLOWED_LANES ?? ''
  if (typeof rawList !== 'string')
    throw new Error('JOBS_ALLOWED_LANES must be a list')
  const names = rawList
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (
    names.length > jobLanes.length ||
    new Set(names).size !== names.length ||
    names.some((x) => !isJobLane(x))
  )
    throw new Error('Invalid/duplicate G10 allowed lane')
  if ((enabled === true || enabled === 'true') && (!secret || !names.length))
    throw new Error('Cron requires secret and explicit allowed lanes')
  return {
    JOBS_CRON_ENABLED: enabled === true || enabled === 'true',
    JOBS_CRON_SECRET: secret,
    JOBS_ALLOWED_LANES: names as JobLane[],
  }
}
