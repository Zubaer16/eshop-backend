import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { JobsService } from '../jobs/jobs.service'
import { parseWorkerOptions } from '../jobs/jobs.policy'
async function main() {
  // Validate args before connecting to DB. Preview is read-only by default.
  const args = parseWorkerOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  })
  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  try {
    const jobs = app.get(JobsService)
    do {
      try {
        const result = await jobs.tick('WORKER', args.lane, args.apply)
        console.log(JSON.stringify(result))
      } catch {
        console.error(
          'G10 worker tick failed; inspect safe admin status/run records',
        )
        if (!args.loop) process.exitCode = 1
      }
      if (!args.loop || stopping) break
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, args.interval * 1000)
        // Signal handlers should not leave a busy polling loop running forever.
        if (stopping) {
          clearTimeout(timer)
          resolve()
        }
      })
    } while (!stopping)
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'G10 worker failed. Verify env, migrations and job lane allowlist.',
  )
  process.exitCode = 1
})
