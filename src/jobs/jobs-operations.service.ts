import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

/** Safe, PII-free operational projections. Never exposes event payloads, tokens or provider IDs. */
@Injectable()
export class JobsOperationsService {
  constructor(private readonly db: DatabaseService) {}

  async status() {
    const [
      schedules,
      runs,
      notification,
      emailPlan,
      pushPlan,
      emailDelivery,
      pushDelivery,
      mediaJobs,
      payments,
    ] = await Promise.all([
      this.db.client.jobSchedule.findMany({
        orderBy: { lane: 'asc' },
        select: {
          lane: true,
          nextRunAt: true,
          leaseExpiresAt: true,
          lastStartedAt: true,
          lastFinishedAt: true,
          lastOutcome: true,
          consecutiveFailures: true,
        },
      }),
      this.db.client.jobRun.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.client.notificationEventReceipt.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.emailEventReceipt.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.pushEventReceipt.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.emailDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.pushDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.mediaDeletionJob.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.client.paymentAttempt.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])
    const counts = (rows: { status: string; _count: { _all: number } }[]) =>
      Object.fromEntries(rows.map((row) => [row.status, row._count._all]))
    return {
      capturedAt: new Date().toISOString(),
      semantics:
        'Current status counts, not throughput or provider delivery proof',
      schedules,
      runs: counts(runs),
      lanes: {
        notifications: counts(notification),
        emailPlanning: counts(emailPlan),
        pushPlanning: counts(pushPlan),
        emailDelivery: counts(emailDelivery),
        pushDelivery: counts(pushDelivery),
        mediaDeletion: counts(mediaJobs),
        paymentAttempts: counts(payments),
      },
    }
  }

  async runs(limit = 50) {
    const rows = await this.db.client.jobRun.findMany({
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        lane: true,
        trigger: true,
        status: true,
        processed: true,
        errorCode: true,
        startedAt: true,
        finishedAt: true,
      },
    })
    return { items: rows, limit: Math.min(Math.max(limit, 1), 100) }
  }

  async failures() {
    // Bounded, stable pagination through each independent failure domain.
    const [notification, emailPlan, pushPlan, email, push, media, campaigns] =
      await Promise.all([
        this.db.client.notificationEventReceipt.findMany({
          where: { status: 'FAILED' },
          select: {
            eventId: true,
            attempts: true,
            failureCode: true,
            nextAttemptAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.emailEventReceipt.findMany({
          where: { status: 'FAILED' },
          select: {
            eventId: true,
            attempts: true,
            failureCode: true,
            nextAttemptAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.pushEventReceipt.findMany({
          where: { status: 'FAILED' },
          select: {
            eventId: true,
            attempts: true,
            failureCode: true,
            nextAttemptAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.emailDelivery.findMany({
          where: {
            status: { in: ['FAILED', 'REQUIRES_REVIEW', 'PROCESSING'] },
          },
          select: {
            id: true,
            status: true,
            attempts: true,
            failureCode: true,
            nextAttemptAt: true,
            leaseExpiresAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.pushDelivery.findMany({
          where: {
            status: { in: ['FAILED', 'REQUIRES_REVIEW', 'PROCESSING'] },
          },
          select: {
            id: true,
            status: true,
            attempts: true,
            failureCode: true,
            nextAttemptAt: true,
            leaseExpiresAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.mediaDeletionJob.findMany({
          where: { status: { in: ['FAILED', 'PROCESSING'] } },
          select: {
            id: true,
            status: true,
            attempts: true,
            claimedAt: true,
            availableAt: true,
          },
          take: 25,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.client.pushCampaign.findMany({
          where: { status: 'REQUIRES_REVIEW' },
          select: {
            id: true,
            status: true,
            fanoutAttempts: true,
            fanoutFailureCode: true,
          },
          take: 25,
          orderBy: { id: 'asc' },
        }),
      ])
    return {
      limitPerDomain: 25,
      truncatedPossible: true,
      deliveryCaution:
        'Never replay uncertain/accepted payment, email or FCM submissions from this view',
      notification,
      emailPlanning: emailPlan,
      pushPlanning: pushPlan,
      emailDelivery: email,
      pushDelivery: push,
      mediaDeletion: media,
      pushCampaigns: campaigns,
    }
  }

  /** Only in-app receipt planning is DB-local, deduplicated and safe to explicitly replay. */
  async retryNotificationReceipt(eventId: string, actorId: string) {
    return this.db.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ event_id: string }[]>`
        SELECT event_id FROM notification_event_receipts WHERE event_id=${eventId}::uuid FOR UPDATE`
      if (!locked.length)
        throw new NotFoundException('Notification receipt not found')
      const current = await tx.notificationEventReceipt.findUniqueOrThrow({
        where: { eventId },
      })
      if (current.status !== 'FAILED' || current.attempts < 10)
        throw new ConflictException(
          'Only exhausted in-app notification receipts may be reset',
        )
      await tx.notificationEventReceipt.update({
        where: { eventId },
        data: {
          status: 'FAILED',
          attempts: 0,
          nextAttemptAt: new Date(),
          failureCode: null,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'jobs.notification.receipt.retry',
          targetType: 'outbox',
          targetId: eventId,
        },
      })
      return { eventId, queuedForSafeRetry: true }
    })
  }
}
