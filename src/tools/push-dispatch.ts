import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { parseDispatchOptions } from '../notifications/notifications.policy'
import { PushDispatcher } from '../push/push-dispatcher.service'
async function main() {
  const options = parseDispatchOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(PushDispatcher)
          .dispatch(options.since, options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error('Push dispatch failed; inspect safe status/failure reports')
  process.exitCode = 1
})
