import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import {
  activeNotificationStaff,
  NotificationEventError,
  resolveNotificationEvent,
} from './notification-event'
import { notificationEventTypes, renderTemplate } from './notifications.policy'

type Tx = Prisma.TransactionClient
@Injectable()
export class NotificationDispatcher {
  constructor(private readonly db: DatabaseService) {}
  private async materialize(
    tx: Tx,
    event: {
      id: string
      eventType: string
      payload: Prisma.JsonValue
      createdAt: Date
    },
  ) {
    const context = await resolveNotificationEvent(tx, event)
    if (!context) return
    const {
      type,
      rule,
      variables,
      targetType,
      targetId,
      customerId,
      permission,
    } = context
    const template = await tx.notificationTemplate.findUnique({
      where: { key: rule.kind },
    })
    const title = renderTemplate(template?.title ?? rule.title, variables, 160)
    const body = renderTemplate(template?.body ?? rule.body, variables, 600)
    const emit = async (
      audience: string,
      userIds: string[],
      notificationTitle: string,
      notificationBody: string,
    ) => {
      if (!userIds.length) return
      const n = await tx.notification.upsert({
        where: { eventId_audience: { eventId: event.id, audience } },
        create: {
          eventId: event.id,
          audience,
          kind: rule.kind,
          title: notificationTitle,
          body: notificationBody,
          permissionKey: audience === 'ADMIN' ? permission : null,
          targetType,
          targetId,
          templateRevision: template?.revision ?? 0,
          createdAt: event.createdAt,
        },
        update: {},
      })
      await tx.notificationRecipient.createMany({
        data: userIds.map((userId) => ({
          userId,
          notificationId: n.id,
          createdAt: event.createdAt,
        })),
        skipDuplicates: true,
      })
    }
    if (customerId) {
      const user = await tx.user.findUnique({
        where: { id: customerId },
        select: { status: true },
      })
      if (user?.status === 'ACTIVE')
        await emit(
          type.startsWith('auth.') ? 'SECURITY' : 'CUSTOMER',
          [customerId],
          title,
          body,
        )
    }
    if (permission)
      await emit(
        'ADMIN',
        await activeNotificationStaff(tx, permission),
        type === 'order.created' ? 'New order' : title,
        type === 'order.created'
          ? 'A new order ' + variables.orderId + ' was placed.'
          : body,
      )
  }
  async dispatch(since: Date, limit = 50, apply = false) {
    const candidates = await this.db.client.outboxEvent.findMany({
      where: {
        eventType: { in: notificationEventTypes },
        createdAt: { gte: since },
        OR: [
          { notificationReceipt: { is: null } },
          {
            notificationReceipt: {
              is: {
                status: { in: ['PENDING', 'FAILED'] },
                attempts: { lt: 10 },
                nextAttemptAt: { lte: new Date() },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(200, Math.max(1, limit)),
    })
    const result = {
      apply,
      candidates: candidates.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    }
    if (!apply) return result
    for (const candidate of candidates) {
      try {
        const handled = await this.db.client.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM outbox_events WHERE id = ${candidate.id}::uuid FOR UPDATE SKIP LOCKED`
            if (!locked.length) return false
            const receipt = await tx.notificationEventReceipt.findUnique({
              where: { eventId: candidate.id },
            })
            if (
              receipt?.status === 'COMPLETED' ||
              (receipt &&
                (receipt.attempts >= 10 || receipt.nextAttemptAt > new Date()))
            )
              return false
            const event = await tx.outboxEvent.findUniqueOrThrow({
              where: { id: candidate.id },
            })
            await this.materialize(tx, event)
            await tx.notificationEventReceipt.upsert({
              where: { eventId: candidate.id },
              create: {
                eventId: candidate.id,
                status: 'COMPLETED',
                attempts: 1,
                processedAt: new Date(),
              },
              update: {
                status: 'COMPLETED',
                attempts: { increment: 1 },
                failureCode: null,
                processedAt: new Date(),
              },
            })
            return true
          },
          { timeout: 20000 },
        )
        if (handled) result.completed++
        else result.skipped++
      } catch (error) {
        result.failed++
        // No exception text/payload/secrets in persistent reporting. Serialize with success workers.
        await this.db.client.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM outbox_events WHERE id = ${candidate.id}::uuid FOR UPDATE`
          if (!locked.length) return
          const prior = await tx.notificationEventReceipt.findUnique({
            where: { eventId: candidate.id },
          })
          if (prior?.status === 'COMPLETED' || (prior && prior.attempts >= 10))
            return
          const attempts = (prior?.attempts ?? 0) + 1
          const failureCode =
            error instanceof NotificationEventError
              ? error.message
              : 'NOTIFICATION_DISPATCH_FAILED'
          const values = {
            status: 'FAILED',
            attempts,
            failureCode,
            nextAttemptAt: new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** (attempts - 1)),
            ),
          }
          await tx.notificationEventReceipt.upsert({
            where: { eventId: candidate.id },
            create: { eventId: candidate.id, ...values },
            update: values,
          })
        })
      }
    }
    return result
  }
}
