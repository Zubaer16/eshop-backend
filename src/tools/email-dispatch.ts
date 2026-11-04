import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { parseDispatchOptions } from '../notifications/notifications.policy'
import { EmailDispatcher } from '../email/email-dispatcher.service'
async function main() {
  const options = parseDispatchOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(EmailDispatcher)
          .dispatch(options.since, options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Email dispatch failed; inspect safe administrative status and deployment configuration',
  )
  process.exitCode = 1
})
