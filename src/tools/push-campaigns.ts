import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { parsePushCampaignOptions } from '../push/push-options'
import { PushCampaignsService } from '../push/push-campaigns.service'
async function main() {
  const options = parsePushCampaignOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(PushCampaignsService)
          .fanout(options.limit, options.apply),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error('Push campaigns failed; inspect safe status/failure reports')
  process.exitCode = 1
})
