import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { parseDispatchOptions } from '../notifications/notifications.policy'
import { EmailQueue } from '../email/email-queue.service'
async function main() {
  const options = parseDispatchOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(EmailQueue)
          .queue(options.since, options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Email queue failed; inspect safe administrative status and deployment configuration',
  )
  process.exitCode = 1
})
