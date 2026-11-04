import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service'
import { parseDispatchOptions } from '../notifications/notifications.policy'
async function main() {
  const options = parseDispatchOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(NotificationDispatcher)
          .dispatch(options.since, options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Notification dispatch failed; inspect database configuration and safe failure reporting',
  )
  process.exitCode = 1
})
