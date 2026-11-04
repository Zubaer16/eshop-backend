import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, type CatalogRole } from './catalog-test-support'
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher.service'
import { DatabaseService } from '../src/database/database.service'
export class NotificationsFixture extends CatalogTestFixture {
  readonly since = new Date()
  readonly eventIds: string[] = []
  readonly userIds: string[] = []
  override async account(role: CatalogRole) {
    const user = await super.account(role)
    this.userIds.push(user.id)
    return user
  }
  async event(
    eventType: string,
    payload: Record<string, string>,
    status: 'PENDING' | 'COMPLETED' = 'PENDING',
  ) {
    const id = randomUUID()
    await this.db.outboxEvent.create({
      data: { id, eventType, payload, status },
    })
    this.eventIds.push(id)
    return id
  }
  dispatcher() {
    return new NotificationDispatcher({
      client: this.db,
    } as unknown as DatabaseService)
  }
  override async close() {
    try {
      await this.db.notification.deleteMany({
        where: { eventId: { in: this.eventIds } },
      })
      await this.db.outboxEvent.deleteMany({
        where: { id: { in: this.eventIds } },
      })
    } finally {
      await super.close()
    }
  }
}
export const preferenceInput = {
  expectedRevision: 0,
  transactionalEmail: false,
  transactionalPush: false,
  operationalInApp: true,
  operationalEmail: false,
  operationalPush: true,
  marketingInApp: false,
  marketingEmail: false,
  marketingPush: false,
}
