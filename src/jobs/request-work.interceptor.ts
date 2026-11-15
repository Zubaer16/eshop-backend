import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { waitUntil } from '@vercel/functions'
import { Observable } from 'rxjs'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service'
import { EmailQueue } from '../email/email-queue.service'
import { EmailDispatcher } from '../email/email-dispatcher.service'
import { PushQueue } from '../push/push-queue.service'
import { PushDispatcher } from '../push/push-dispatcher.service'
import { PushCampaignsService } from '../push/push-campaigns.service'
import { RefundExecutionService } from '../payments/refunds/refund-execution.service'
import { PaymentCancellationService } from '../payments/payment-cancellation.service'
import { stripeTestCapabilityEnabled } from '../payments/stripe-demo-policy'
import { MediaRenditionService } from '../media/media-rendition.service'
import { MediaService } from '../media/media.service'
import {
  newRequestWork,
  requestWork,
  recordRequestWork,
  type RequestWork,
  type RequestWorkScope,
} from './request-work.context'

const since = new Date(0)
const standaloneAuthEmails = new Set([
  'auth.email_verification.requested',
  'auth.password_reset.requested',
])

@Injectable()
export class ImmediateActions {
  private readonly logger = new Logger(ImmediateActions.name)

  constructor(
    private readonly modules: ModuleRef,
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  start(scope: RequestWorkScope) {
    if (scope.started) return
    scope.started = true
    if (!scope.pending.size) return
    waitUntil(requestWork.run(scope, () => this.drain(scope)))
  }

  private async drain(scope: RequestWorkScope) {
    while (scope.pending.size) {
      // Start an authorized refund before delivering its notification emails.
      const [key, work] =
        [...scope.pending].find(([, item]) => item.kind === 'refund') ??
        scope.pending.entries().next().value!
      scope.pending.delete(key)
      scope.visited.add(key)
      try {
        await this.process(work)
      } catch {
        this.logger.warn(
          'Immediate action processing deferred to durable recovery',
        )
      }
    }
  }

  private async attempt(work: () => Promise<unknown>) {
    try {
      await work()
    } catch {
      this.logger.warn('Immediate action stage deferred to durable recovery')
    }
  }

  private async process(work: RequestWork) {
    if (work.kind === 'notification') {
      await this.modules
        .get(NotificationDispatcher, { strict: false })
        .dispatch(since, 1, true, work.id)
      return
    }
    if (work.kind === 'deletion') {
      await this.modules
        .get(MediaService, { strict: false })
        .cleanupBatch(1, work.id)
      return
    }
    if (work.kind === 'inventory') {
      const events = await this.db.client.outboxEvent.findMany({
        where: {
          eventType: 'inventory.low_stock',
          payload: { path: ['balanceId'], equals: work.id },
          createdAt: { gte: requestWork.getStore()!.createdAt },
        },
        select: { id: true },
      })
      for (const event of events) recordRequestWork('event', event.id)
      return
    }
    if (work.kind === 'refund') {
      if (!stripeTestCapabilityEnabled(this.config, 'refunds')) return
      await this.modules
        .get(RefundExecutionService, { strict: false })
        .process(work.id)
      return
    }
    if (work.kind === 'media') {
      const renditions = this.modules.get(MediaRenditionService, {
        strict: false,
      })
      await renditions.backfill(1, work.id)
      recordRequestWork('event', work.id)
      return
    }
    const event = await this.db.client.outboxEvent.findUnique({
      where: { id: work.id },
      select: { id: true, eventType: true, payload: true },
    })
    // A rolled-back transaction can have collected an ID before failing.
    if (!event) return
    if (event.eventType === 'media.renditions') {
      await this.modules
        .get(MediaRenditionService, { strict: false })
        .processBatch(1, event.id)
      return
    }
    const payload =
      event.payload &&
      typeof event.payload === 'object' &&
      !Array.isArray(event.payload)
        ? event.payload
        : {}

    if (
      ['order.cancelled', 'order.expired'].includes(event.eventType) &&
      typeof payload.orderId === 'string' &&
      this.config.get('STRIPE_TEST_ENABLED', { infer: true })
    ) {
      await this.attempt(() =>
        this.modules
          .get(PaymentCancellationService, { strict: false })
          .cancelBatch(25, payload.orderId as string),
      )
    }
    if (event.eventType === 'push.campaign.approved') {
      const campaigns = this.modules.get(PushCampaignsService, {
        strict: false,
      })
      await this.attempt(async () => {
        let result
        do {
          result = await campaigns.fanout(50, true, event.id)
          if (
            this.config.get('PUSH_DELIVERY_MODE', { infer: true }) !==
            'disabled'
          )
            await this.dispatchPush(event.id)
        } while (result.recipients === 50 && !result.failed)
      })
      return
    }
    if (standaloneAuthEmails.has(event.eventType)) return
    await Promise.all([
      this.attempt(() =>
        this.modules
          .get(NotificationDispatcher, { strict: false })
          .dispatch(since, 1, true, event.id),
      ),
      this.attempt(() => this.email(event.id)),
      this.attempt(() => this.push(event.id)),
    ])
  }

  private async email(eventId: string) {
    if (this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) === 'disabled')
      return
    await this.modules
      .get(EmailQueue, { strict: false })
      .queue(since, 1, true, eventId)
    const dispatcher = this.modules.get(EmailDispatcher, { strict: false })
    let result
    do {
      result = await dispatcher.dispatch(since, 50, true, eventId)
    } while (
      result.candidates === 50 &&
      result.accepted + result.failed + result.review > 0
    )
  }

  private async push(eventId: string) {
    if (this.config.get('PUSH_DELIVERY_MODE', { infer: true }) === 'disabled')
      return
    await this.modules
      .get(PushQueue, { strict: false })
      .queue(since, 1, true, eventId)
    await this.dispatchPush(eventId)
  }

  private async dispatchPush(eventId: string) {
    const dispatcher = this.modules.get(PushDispatcher, { strict: false })
    let result
    do {
      result = await dispatcher.dispatch(since, 50, true, eventId)
    } while (
      result.candidates === 50 &&
      result.accepted + result.failed + result.review > 0
    )
  }
}

@Injectable()
export class RequestWorkInterceptor implements NestInterceptor {
  constructor(private readonly actions: ImmediateActions) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return new Observable((subscriber) => {
      const scope = newRequestWork()
      return requestWork.run(scope, () =>
        next.handle().subscribe({
          next: (value: unknown) => {
            this.actions.start(scope)
            subscriber.next(value)
          },
          error: (error: unknown) => {
            this.actions.start(scope)
            subscriber.error(error)
          },
          complete: () => subscriber.complete(),
        }),
      )
    })
  }
}
