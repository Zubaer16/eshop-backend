'use strict'
// Read-only G10 source wiring audit. Not runtime acceptance.
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const checks = [
  ['src/app.module.ts', /JobsModule/],
  ['src/jobs/jobs.module.ts', /JobsAdminController/],
  ['src/jobs/jobs.service.ts', /INSERT INTO job_schedules/],
  ['src/jobs/jobs.service.ts', /refunds\.processBatch/],
  ['src/jobs/jobs.service.ts', /media\.cleanupBatch/],
  ['src/jobs/jobs.service.ts', /emailDispatcher\.dispatch/],
  ['src/jobs/jobs.service.ts', /pushDispatcher\.dispatch/],
  ['src/jobs/jobs-operations.service.ts', /retryNotificationReceipt/],
  ['src/jobs/jobs.controller.ts', /timingSafeEqual/],
  ['src/config/environment.ts', /jobsConfiguration/],
  ['prisma/schema.prisma', /model JobSchedule/],
  [
    'prisma/migrations/20261104160000_phase05i_g10_job_schedule/migration.sql',
    /CREATE TABLE "job_runs"/,
  ],
  ['src/tools/jobs-worker.ts', /parseWorkerOptions/],
]
let failed = false
for (const [file, pattern] of checks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const ok = pattern.test(source)
  if (!ok) failed = true
  process.stdout.write(`${ok ? 'MATCH' : 'MISMATCH'} ${file} ${pattern}\n`)
}
if (failed) process.exitCode = 1
else
  process.stdout.write(
    'G10 source presence verified; runtime validation deferred to G12.\n',
  )
