import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { notificationEventTypes } from '../notifications/notifications.policy'
import { PushPolicySkip } from './push-content'
import { PushContent } from './push-content'
import { NotificationEventError } from '../notifications/notification-event'
@Injectable()
export class PushQueue {
  private readonly content: PushContent
  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<Environment, true>,
  ) {
    this.content = new PushContent(config)
  }
  async queue(since: Date, limit = 50, apply = false) {
    const candidates = await this.db.client.outboxEvent.findMany({
      where: {
        eventType: { in: notificationEventTypes },
        createdAt: { gte: since },
        OR: [
          { pushReceipt: { is: null } },
          {
            pushReceipt: {
              is: {
                status: 'FAILED',
                attempts: { lt: 5 },
                nextAttemptAt: { lte: new Date() },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
    const result = {
      apply,
      candidates: candidates.length,
      processed: 0,
      queued: 0,
      failed: 0,
      skipped: 0,
    }
    if (!apply) return result
    for (const candidate of candidates) {
      try {
        const count = await this.db.client.$transaction(
          async (tx) => {
            const lock = await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM outbox_events WHERE id=${candidate.id}::uuid FOR UPDATE SKIP LOCKED`
            if (!lock.length) return null
            const receipt = await tx.pushEventReceipt.findUnique({
              where: { eventId: candidate.id },
            })
            if (
              receipt &&
              (receipt.status !== 'FAILED' ||
                receipt.attempts >= 5 ||
                receipt.nextAttemptAt > new Date())
            )
              return null
            const event = await tx.outboxEvent.findUniqueOrThrow({
              where: { id: candidate.id },
            })
            let entries: Awaited<ReturnType<PushContent['plan']>>
            let skipCode: string | null = null
            try {
              entries = await this.content.plan(tx, event)
            } catch (error) {
              if (!(error instanceof PushPolicySkip)) throw error
              entries = []
              skipCode = error.message
            }
            let queued = 0
            for (const entry of entries) {
              const job = await tx.pushDelivery.createMany({
                data: [{ eventId: event.id, ...entry }],
                skipDuplicates: true,
              })
              queued += job.count
            }
            const status = entries.length ? 'COMPLETED' : 'SKIPPED'
            await tx.pushEventReceipt.upsert({
              where: { eventId: event.id },
              create: {
                eventId: event.id,
                status,
                attempts: 1,
                processedAt: new Date(),
                failureCode: skipCode,
              },
              update: {
                status,
                attempts: { increment: 1 },
                processedAt: new Date(),
                failureCode: skipCode,
              },
            })
            return queued
          },
          { timeout: 20000 },
        )
        if (count === null) result.skipped++
        else {
          result.processed++
          result.queued += count
        }
      } catch (error) {
        result.failed++
        await this.db.client.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM outbox_events WHERE id=${candidate.id}::uuid FOR UPDATE`
          if (
            !(await tx.outboxEvent.findUnique({
              where: { id: candidate.id },
              select: { id: true },
            }))
          )
            return
          const prior = await tx.pushEventReceipt.findUnique({
            where: { eventId: candidate.id },
          })
          if (prior && (prior.status !== 'FAILED' || prior.attempts >= 5))
            return
          const attempts = (prior?.attempts ?? 0) + 1,
            values = {
              status: 'FAILED',
              attempts,
              failureCode:
                error instanceof NotificationEventError
                  ? error.message
                  : 'PUSH_QUEUE_FAILED',
              nextAttemptAt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** (attempts - 1)),
              ),
            }
          await tx.pushEventReceipt.upsert({
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
