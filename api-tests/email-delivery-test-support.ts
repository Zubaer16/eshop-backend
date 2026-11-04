import { ConfigService } from '@nestjs/config'
import { expect } from '@playwright/test'
import { validateEnvironment, Environment } from '../src/config/environment'
import { EmailMessage, EmailProvider } from '../src/email/email.provider'
import { EmailQueue } from '../src/email/email-queue.service'
import { EmailDispatcher } from '../src/email/email-dispatcher.service'
import { DatabaseService } from '../src/database/database.service'
import { NotificationsFixture } from './notifications-test-support'
import { bearer } from './catalog-test-support'
export class RecordingEmailProvider extends EmailProvider {
  calls = 0
  readonly messages: EmailMessage[] = []
  failure: Error | null = null
  async submit(message: EmailMessage) {
    this.calls++
    if (this.failure) throw this.failure
    this.messages.push(message)
  }
}
export function emailTestConfiguration(allowlist: string[]) {
  return new ConfigService<Environment, true>(
    validateEnvironment({
      EMAIL_DELIVERY_MODE: 'controlled',
      EMAIL_SMTP_HOST: 'smtp.example.test',
      EMAIL_SMTP_USER: 'sender@example.test',
      EMAIL_SMTP_PASSWORD: 'test-only',
      EMAIL_FROM_ADDRESS: 'sender@example.test',
      EMAIL_PUBLIC_ORIGIN: 'https://shop.example.test',
      EMAIL_ADMIN_ORIGIN: 'https://admin.example.test',
      EMAIL_RECIPIENT_ALLOWLIST: allowlist.join(','),
      AUTH_ACTION_TOKEN_ENCRYPTION_KEY:
        process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY,
    }),
  )
}
export class EmailFixture extends NotificationsFixture {
  queue(allowlist: string[]) {
    return new EmailQueue(
      { client: this.db } as unknown as DatabaseService,
      emailTestConfiguration(allowlist),
    )
  }
  sender(allowlist: string[], provider: EmailProvider) {
    return new EmailDispatcher(
      { client: this.db } as unknown as DatabaseService,
      emailTestConfiguration(allowlist),
      provider,
    )
  }
  override async close() {
    try {
      const own = await this.db.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'auth.email_verification.requested',
              'auth.password_reset.requested',
            ],
          },
          OR: this.userIds.map((id) => ({
            payload: { path: ['userId'], equals: id },
          })),
        },
        select: { id: true },
      })
      this.eventIds.push(...own.map((row) => row.id))
      await this.db.emailDelivery.deleteMany({
        where: {
          OR: [
            { userId: { in: this.userIds } },
            { eventId: { in: this.eventIds } },
          ],
        },
      })
    } finally {
      await super.close()
    }
  }
}
export { expect, bearer }
