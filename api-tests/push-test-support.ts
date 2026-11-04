import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { type CatalogRole, bearer } from './catalog-test-support'
import { MerchandisingFixture } from './merchandising-test-support'
import { Environment, validateEnvironment } from '../src/config/environment'
import { PushQueue } from '../src/push/push-queue.service'
import { PushDispatcher } from '../src/push/push-dispatcher.service'
import { PushCampaignsService } from '../src/push/push-campaigns.service'
import { PushProvider, type PushMessage } from '../src/push/push.provider'
import { DatabaseService } from '../src/database/database.service'
import { expect } from '@playwright/test'
const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString()
export const pushConfig = (ids: string[]) =>
  new ConfigService<Environment, true>(
    validateEnvironment({
      PUSH_DELIVERY_MODE: 'controlled',
      FCM_PROJECT_ID: 'kookaburra-api-test',
      FCM_CLIENT_EMAIL: 'fixture@kookaburra-api-test.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: key,
      PUSH_TOKEN_ENCRYPTION_KEY: process.env.PUSH_TOKEN_ENCRYPTION_KEY,
      PUSH_RECIPIENT_USER_IDS: ids.join(','),
      PUSH_STOREFRONT_ORIGIN: 'https://store.example.test',
      PUSH_ADMIN_ORIGIN: 'https://admin.example.test',
    }),
  )
export class RecordingPushProvider extends PushProvider {
  calls = 0
  readonly messages: PushMessage[] = []
  failure: Error | null = null
  async submit(message: PushMessage) {
    this.calls++
    if (this.failure) throw this.failure
    this.messages.push(message)
    return {
      messageId: 'projects/kookaburra-api-test/messages/' + message.deliveryId,
    }
  }
}
export class PushFixture extends MerchandisingFixture {
  readonly since = new Date()
  readonly userIds: string[] = []
  readonly eventIds: string[] = []
  readonly campaignIds: string[] = []
  override async account(role: CatalogRole) {
    const user = await super.account(role)
    this.userIds.push(user.id)
    return user
  }
  async event(eventType: string, payload: Record<string, string>) {
    const id = randomUUID()
    await this.db.outboxEvent.create({ data: { id, eventType, payload } })
    this.eventIds.push(id)
    return id
  }
  async device(
    user: { token: string },
    surface = 'STOREFRONT',
    installationId: string = randomUUID(),
    token = 'fixture-fcm-' + randomUUID(),
    expectedRevision = 0,
  ) {
    const response = await this.http.post('/v1/notifications/push/devices', {
      headers: bearer(user.token),
      data: {
        expectedRevision,
        installationId,
        surface,
        token,
        permission: 'GRANTED',
      },
    })
    expect(response.status()).toBe(201)
    return {
      ...((await response.json()) as {
        id: string
        revision: number
        installationId: string
      }),
      rawToken: token,
    }
  }
  async campaign(
    owner: { token: string },
    overrides: Record<string, unknown> = {},
  ) {
    const input = {
      expectedRevision: 0,
      title: 'G8 new collection',
      body: 'Discover our latest picks.',
      audience: 'ALL_OPTED_IN_CUSTOMERS',
      targetType: 'HOME',
      targetId: null,
      imageMediaId: null,
      ...overrides,
    }
    const response = await this.http.post('/v1/admin/push/campaigns', {
      headers: bearer(owner.token),
      data: input,
    })
    expect(response.status()).toBe(201)
    const row = (await response.json()) as { id: string; revision: number }
    this.campaignIds.push(row.id)
    return { ...row, input }
  }
  queue(ids: string[]) {
    return new PushQueue(
      { client: this.db } as unknown as DatabaseService,
      pushConfig(ids),
    )
  }
  sender(ids: string[], provider: PushProvider) {
    return new PushDispatcher(
      { client: this.db } as unknown as DatabaseService,
      pushConfig(ids),
      provider,
    )
  }
  campaigns(ids: string[]) {
    return new PushCampaignsService(
      { client: this.db } as unknown as DatabaseService,
      pushConfig(ids),
    )
  }
  override async close() {
    try {
      const rows = await this.db.pushCampaign.findMany({
        where: { id: { in: this.campaignIds } },
        select: { eventId: true },
      })
      this.eventIds.push(
        ...rows.flatMap((row) => (row.eventId ? [row.eventId] : [])),
      )
      await this.db.pushDelivery.deleteMany({
        where: {
          OR: [
            { device: { userId: { in: this.userIds } } },
            { eventId: { in: this.eventIds } },
            { campaignId: { in: this.campaignIds } },
          ],
        },
      })
      await this.db.notification.deleteMany({
        where: {
          OR: [
            { campaignId: { in: this.campaignIds } },
            { eventId: { in: this.eventIds } },
          ],
        },
      })
      await this.db.pushCampaign.deleteMany({
        where: { id: { in: this.campaignIds } },
      })
      await this.db.pushDevice.deleteMany({
        where: { userId: { in: this.userIds } },
      })
      await this.db.outboxEvent.deleteMany({
        where: { id: { in: this.eventIds } },
      })
    } finally {
      await super.close()
    }
  }
}
export { bearer, expect }
