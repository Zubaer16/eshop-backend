import { randomUUID } from 'node:crypto'
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import { ReservationService } from '../checkout/reservation.service'
import { OrdersService } from '../orders/orders.service'
import { PaymentSettlementService } from '../payments/payment-settlement.service'
import { PaymentCancellationService } from '../payments/payment-cancellation.service'
import { RefundExecutionService } from '../payments/refund-execution.service'
import { MediaService } from '../media/media.service'
import { MediaRenditionService } from '../media/media-rendition.service'
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service'
import { EmailQueue } from '../email/email-queue.service'
import { EmailDispatcher } from '../email/email-dispatcher.service'
import { PushCampaignsService } from '../push/push-campaigns.service'
import { PushQueue } from '../push/push-queue.service'
import { PushDispatcher } from '../push/push-dispatcher.service'
import {
  backoffSeconds,
  countProcessed,
  isJobLane,
  jobCadenceSeconds,
  jobSourceEpoch,
  type JobLane,
} from './jobs.policy'

/**
 * The durable jobs scheduler is a coordinator, not a second financial or delivery ledger.
 * Every lane invokes the already guarded bounded domain worker. A DB-token lease
 * serializes scheduled invocations; the domain worker owns its own idempotency.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly reservations: ReservationService,
    private readonly orders: OrdersService,
    private readonly settlements: PaymentSettlementService,
    private readonly cancellations: PaymentCancellationService,
    private readonly refunds: RefundExecutionService,
    private readonly media: MediaService,
    private readonly renditions: MediaRenditionService,
    private readonly notifications: NotificationDispatcher,
    private readonly emailQueue: EmailQueue,
    private readonly emailDispatcher: EmailDispatcher,
    private readonly campaigns: PushCampaignsService,
    private readonly pushQueue: PushQueue,
    private readonly pushDispatcher: PushDispatcher,
  ) {}

  private permitted(lane: JobLane) {
    if (!this.config.get('JOBS_ALLOWED_LANES', { infer: true }).includes(lane))
      throw new ForbiddenException('Job lane not enabled by deployment')
  }

  /** A lane explicitly opted in cannot bypass a disabled external provider. */
  private async execute(lane: JobLane): Promise<unknown> {
    switch (lane) {
      case 'checkout.reservations':
        return this.reservations.expireBatch(25)
      case 'checkout.orders':
        return this.orders.expireBatch(25)
      case 'payments.reconcile':
        if (!this.config.get('STRIPE_TEST_ENABLED', { infer: true }))
          return { processed: 0 }
        return this.settlements.reconcileBatch(10)
      case 'payments.cancel':
        if (!this.config.get('STRIPE_TEST_ENABLED', { infer: true }))
          return { processed: 0 }
        return this.cancellations.cancelBatch(10)
      case 'refunds.execute':
        if (!this.config.get('STRIPE_TEST_REFUNDS_ENABLED', { infer: true }))
          return { processed: 0 }
        return this.refunds.processBatch(5)
      case 'media.reconcile':
        return this.media.reconcileBatch(25, true)
      case 'media.renditions': {
        const inserted = await this.renditions.backfill(25)
        const result = await this.renditions.processBatch(5)
        return { ...result, enqueued: inserted }
      }
      case 'media.cleanup':
        return this.media.cleanupBatch(10)
      case 'notifications.dispatch':
        return this.notifications.dispatch(jobSourceEpoch, 40, true)
      case 'email.queue':
        return this.emailQueue.queue(jobSourceEpoch, 40, true)
      case 'email.dispatch':
        if (
          this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) === 'disabled'
        )
          return { processed: 0 }
        return this.emailDispatcher.dispatch(jobSourceEpoch, 10, true)
      case 'push.campaigns':
        return this.campaigns.fanout(40, true)
      case 'push.queue':
        return this.pushQueue.queue(jobSourceEpoch, 40, true)
      case 'push.dispatch':
        if (
          this.config.get('PUSH_DELIVERY_MODE', { infer: true }) === 'disabled'
        )
          return { processed: 0 }
        return this.pushDispatcher.dispatch(jobSourceEpoch, 10, true)
      case 'jobs.retention': {
        // Only terminal successful scheduler telemetry is pruned, never audit,
        // outbox, provider submission history, payment facts or failed runs.
        const old = await this.db.client.jobRun.findMany({
          where: {
            status: 'SUCCEEDED',
            finishedAt: { lt: new Date(Date.now() - 90 * 86400000) },
          },
          orderBy: { finishedAt: 'asc' },
          take: 100,
          select: { id: true },
        })
        if (!old.length) return { processed: 0 }
        const deleted = await this.db.client.jobRun.deleteMany({
          where: {
            id: { in: old.map((item) => item.id) },
            status: 'SUCCEEDED',
          },
        })
        return { processed: deleted.count }
      }
      case 'devices.expire': {
        // Keep device and delivery history. Remove expired ciphertext in a bounded batch.
        const ids = await this.db.client.pushDevice.findMany({
          where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
          orderBy: { expiresAt: 'asc' },
          take: 100,
          select: { id: true },
        })
        if (!ids.length) return { processed: 0 }
        const result = await this.db.client.pushDevice.updateMany({
          where: {
            id: { in: ids.map((row) => row.id) },
            status: 'ACTIVE',
            expiresAt: { lte: new Date() },
          },
          data: { status: 'EXPIRED', tokenCiphertext: Prisma.DbNull },
        })
        return { processed: result.count }
      }
    }
  }

  async preview(lane?: JobLane) {
    const allowed = this.config.get('JOBS_ALLOWED_LANES', { infer: true })
    if (lane) this.permitted(lane)
    const names = lane ? [lane] : allowed
    const schedules = await this.db.client.jobSchedule.findMany({
      where: { lane: { in: names } },
      orderBy: [{ nextRunAt: 'asc' }, { lane: 'asc' }],
    })
    const now = new Date()
    return names.map((name) => {
      const schedule = schedules.find((s) => s.lane === name)
      return {
        lane: name,
        enabled: true,
        due: !schedule || schedule.nextRunAt <= now,
        leased: !!schedule?.leaseExpiresAt && schedule.leaseExpiresAt > now,
        nextRunAt: schedule?.nextRunAt.toISOString() ?? null,
        consecutiveFailures: schedule?.consecutiveFailures ?? 0,
      }
    })
  }

  async tick(
    trigger: 'CRON' | 'WORKER' = 'WORKER',
    lane?: JobLane,
    apply = false,
  ) {
    if (lane && !isJobLane(lane))
      throw new BadRequestException('Invalid job lane')
    const ready = await this.preview(lane)
    if (!apply) return { apply: false, lanes: ready }
    const candidates = ready
      .filter((row) => row.due && !row.leased)
      // Never-run lanes first, then oldest due lane. Bounded 3 per tick.
      .sort(
        (a, b) =>
          (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? '') ||
          a.lane.localeCompare(b.lane),
      )
      .slice(0, lane ? 1 : 3)
    const outcomes: { lane: JobLane; status: string; processed: number }[] = []
    for (const candidate of candidates) {
      const result = await this.runLane(candidate.lane, trigger)
      outcomes.push(result)
    }
    return { apply: true, outcomes }
  }

  private async runLane(lane: JobLane, trigger: 'CRON' | 'WORKER') {
    this.permitted(lane)
    const leaseToken = randomUUID()
    // Atomic, DB-clock claim. No external provider call within a transaction.
    const rows = await this.db.client.$queryRaw<{ lane: string }[]>`
      INSERT INTO job_schedules (lane, lease_token, lease_expires_at, next_run_at, last_started_at, updated_at)
      VALUES (${lane}, ${leaseToken}::uuid,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 minutes',
        CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      ON CONFLICT (lane) DO UPDATE SET
        lease_token=EXCLUDED.lease_token, lease_expires_at=EXCLUDED.lease_expires_at,
        last_started_at=EXCLUDED.last_started_at, updated_at=EXCLUDED.updated_at
      WHERE job_schedules.next_run_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        AND (job_schedules.lease_expires_at IS NULL OR job_schedules.lease_expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
      RETURNING lane`
    if (!rows.length)
      return { lane, status: 'SKIPPED_LEASED_OR_NOT_DUE', processed: 0 }

    // If previous runner disappeared, this only changes scheduler metadata; it
    // never retries a provider delivery with uncertain acceptance.
    await this.db.client.jobRun.updateMany({
      where: { lane, status: 'RUNNING', leaseToken: { not: leaseToken } },
      data: {
        status: 'ABANDONED',
        errorCode: 'LEASE_EXPIRED',
        finishedAt: new Date(),
      },
    })
    const run = await this.db.client.jobRun.create({
      data: { lane, leaseToken, trigger, status: 'RUNNING' },
      select: { id: true },
    })
    let heartbeatFailed = false
    // A running VPS worker may outlive the initial lease. Renewal requires the
    // same fencing token. On process death no renewal occurs.
    const heartbeat = setInterval(() => {
      void this.db.client.$executeRaw`
        UPDATE job_schedules
        SET lease_expires_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 minutes',
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE lane = ${lane} AND lease_token = ${leaseToken}::uuid
          AND lease_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      `
        .then((count) => {
          if (count !== 1) heartbeatFailed = true
        })
        .catch(() => {
          heartbeatFailed = true
        })
    }, 30_000)
    heartbeat.unref()
    let status = 'SUCCEEDED'
    let processed = 0
    try {
      processed = countProcessed(await this.execute(lane))
      if (heartbeatFailed) throw new Error('Job lease heartbeat lost')
    } catch {
      // Never persist/log provider exceptions, payloads, PII or secrets.
      status = 'FAILED'
    } finally {
      clearInterval(heartbeat)
    }
    await this.db.client.$transaction(async (tx) => {
      const schedule = await tx.jobSchedule.findUnique({
        where: { lane },
        select: { consecutiveFailures: true },
      })
      const failures =
        status === 'FAILED' ? (schedule?.consecutiveFailures ?? 0) + 1 : 0
      const cooldown =
        status === 'FAILED' ? backoffSeconds(failures) : jobCadenceSeconds[lane]
      const changed = await tx.jobSchedule.updateMany({
        where: { lane, leaseToken },
        data: {
          leaseToken: null,
          leaseExpiresAt: null,
          lastFinishedAt: new Date(),
          lastOutcome: status,
          consecutiveFailures: failures,
          nextRunAt: new Date(Date.now() + cooldown * 1000),
        },
      })
      await tx.jobRun.updateMany({
        where: { id: run.id, leaseToken, status: 'RUNNING' },
        data: {
          status: changed.count === 1 ? status : 'ABANDONED',
          processed,
          finishedAt: new Date(),
          errorCode:
            changed.count !== 1
              ? 'FENCED'
              : status === 'FAILED'
                ? 'LANE_FAILED'
                : null,
        },
      })
    })
    return { lane, status, processed }
  }
}
