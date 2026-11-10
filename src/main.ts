import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHttpApp } from './bootstrap'
import { Environment } from './config/environment'
import { NestFactory } from '@nestjs/core'

void NestFactory

async function bootstrap(): Promise<void> {
  const app = await createHttpApp()
  const config = app.get(ConfigService<Environment, true>)
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0')
  Logger.log('API listening; live route: /v1/health', 'Bootstrap')
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : 'Application startup failed',
    undefined,
    'Bootstrap',
  )
  process.exitCode = 1
})
