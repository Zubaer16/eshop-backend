import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { parseDispatchOptions } from '../notifications/notifications.policy'
import { PushQueue } from '../push/push-queue.service'
async function main() {
  const options = parseDispatchOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(PushQueue)
          .queue(options.since, options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error('Push queue failed; inspect safe status/failure reports')
  process.exitCode = 1
})
