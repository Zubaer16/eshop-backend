import { ConfigService } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { CallHandler, ExecutionContext } from '@nestjs/common'
import { waitUntil } from '@vercel/functions'
import { defer, lastValueFrom, of, throwError } from 'rxjs'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { EmailQueue } from '../email/email-queue.service'
import { EmailDispatcher } from '../email/email-dispatcher.service'
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service'
import { PushQueue } from '../push/push-queue.service'
import { PushDispatcher } from '../push/push-dispatcher.service'
import { PushCampaignsService } from '../push/push-campaigns.service'
import { RefundExecutionService } from '../payments/refunds/refund-execution.service'
import { PaymentCancellationService } from '../payments/payment-cancellation.service'
import { MediaRenditionService } from '../media/media-rendition.service'
import { MediaService } from '../media/media.service'
import {
  ImmediateActions,
  RequestWorkInterceptor,
} from './request-work.interceptor'
import {
  collectRequestWork,
  newRequestWork,
  recordRequestWork,
  requestWork,
  type RequestWork,
} from './request-work.context'

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))

describe('request work collection and lifecycle', () => {
  it('collects exact IDs, deduplicates upserts and ignores unrelated operations', () => {
    const scope = newRequestWork()
    requestWork.run(scope, () => {
      collectRequestWork('OutboxEvent', 'create', {}, { id: 'event-a' })
      collectRequestWork(
        'OutboxEvent',
        'upsert',
        { where: { id: 'event-a' } },
        {},
      )
      collectRequestWork('OutboxEvent', 'findUnique', {}, { id: 'unrelated' })
      collectRequestWork(
        'MediaAsset',
        'updateMany',
        {
          where: { id: 'media-a' },
          data: { status: 'ACTIVE' },
        },
        { count: 1 },
      )
      collectRequestWork(
        'MediaAsset',
        'updateMany',
        {
          where: { id: 'failed-media' },
          data: { status: 'ACTIVE' },
        },
        { count: 0 },
      )
      collectRequestWork(
        'InventoryMovement',
        'create',
        { data: { balanceId: 'balance-a' } },
        {},
      )
      collectRequestWork(
        'InventoryBalance',
        'update',
        {
          where: { id: 'balance-a' },
          data: { lowStockThreshold: 5 },
        },
        {},
      )
    })
    expect([...scope.pending.keys()]).toEqual([
      'event:event-a',
      'media:media-a',
      'inventory:balance-a',
    ])
  })

  it('keeps concurrent requests isolated and leaves CLI work outside the HTTP context', async () => {
    const first = newRequestWork(),
      second = newRequestWork()
    await Promise.all([
      requestWork.run(first, async () => {
        await Promise.resolve()
        recordRequestWork('event', 'first')
      }),
      requestWork.run(second, async () => {
        await Promise.resolve()
        recordRequestWork('event', 'second')
      }),
    ])
    recordRequestWork('event', 'outside')
    expect([...first.pending.keys()]).toEqual(['event:first'])
    expect([...second.pending.keys()]).toEqual(['event:second'])
  })

  it('starts background work after the handler resolves and preserves the response', async () => {
    const start = jest.fn()
    const interceptor = new RequestWorkInterceptor({
      start,
    } as unknown as ImmediateActions)
    const handler = {
      handle: () =>
        defer(async () => {
          recordRequestWork('event', 'committed')
          expect(start).not.toHaveBeenCalled()
          return { accepted: true }
        }),
    } as CallHandler
    await expect(
      lastValueFrom(interceptor.intercept({} as ExecutionContext, handler)),
    ).resolves.toEqual({ accepted: true })
    expect(start.mock.calls[0]![0].pending.has('event:committed')).toBe(true)
  })

  it('preserves handler errors while allowing committed work to be rechecked', async () => {
    const start = jest.fn()
    const interceptor = new RequestWorkInterceptor({
      start,
    } as unknown as ImmediateActions)
    const error = new Error('handler failed')
    const result = interceptor.intercept({} as ExecutionContext, {
      handle: () => throwError(() => error),
    })
    await expect(lastValueFrom(result)).rejects.toBe(error)
    expect(start).toHaveBeenCalledTimes(1)
  })
})

describe('immediate action processing', () => {
  beforeEach(() => jest.clearAllMocks())
  function setup() {
    const events = new Map<
      string,
      { id: string; eventType: string; payload: Record<string, string> }
    >()
    const delivery = {
      candidates: 0,
      accepted: 0,
      failed: 0,
      review: 0,
      skipped: 0,
    }
    const notifications = {
      dispatch: jest.fn().mockResolvedValue({ completed: 1 }),
    }
    const emailQueue = { queue: jest.fn().mockResolvedValue({ queued: 1 }) }
    const email = { dispatch: jest.fn().mockResolvedValue(delivery) }
    const pushQueue = { queue: jest.fn().mockResolvedValue({ queued: 1 }) }
    const push = { dispatch: jest.fn().mockResolvedValue(delivery) }
    const campaigns = {
      fanout: jest.fn().mockResolvedValue({ recipients: 0, failed: 0 }),
    }
    const refunds = { process: jest.fn().mockResolvedValue('SUCCEEDED') }
    const cancellations = {
      cancelBatch: jest.fn().mockResolvedValue({ checked: 1 }),
    }
    const renditions = {
      backfill: jest.fn().mockResolvedValue(1),
      processBatch: jest.fn().mockResolvedValue({ processed: 1 }),
    }
    const media = {
      cleanupBatch: jest.fn().mockResolvedValue({ processed: 1 }),
    }
    const providers = new Map<unknown, unknown>([
      [NotificationDispatcher, notifications],
      [EmailQueue, emailQueue],
      [EmailDispatcher, email],
      [PushQueue, pushQueue],
      [PushDispatcher, push],
      [PushCampaignsService, campaigns],
      [RefundExecutionService, refunds],
      [PaymentCancellationService, cancellations],
      [MediaRenditionService, renditions],
      [MediaService, media],
    ])
    const findMany = jest.fn().mockResolvedValue([])
    const db = {
      client: {
        outboxEvent: {
          findUnique: jest.fn(
            async ({ where }: { where: { id: string } }) =>
              events.get(where.id) ?? null,
          ),
          findMany,
        },
      },
    }
    const config = {
      get: (key: string) =>
        key.endsWith('_DELIVERY_MODE') ? 'controlled' : true,
    }
    const actions = new ImmediateActions(
      {
        get: (token: unknown) => providers.get(token),
      } as unknown as ModuleRef,
      db as unknown as DatabaseService,
      config as unknown as ConfigService<Environment, true>,
    )
    async function run(kind: RequestWork['kind'], id: string) {
      const scope = newRequestWork()
      requestWork.run(scope, () => recordRequestWork(kind, id))
      actions.start(scope)
      actions.start(scope)
      await jest.mocked(waitUntil).mock.calls.at(-1)![0]
      return scope
    }
    return {
      actions,
      run,
      events,
      db,
      notifications,
      emailQueue,
      email,
      pushQueue,
      push,
      campaigns,
      refunds,
      cancellations,
      renditions,
      media,
    }
  }

  it('dispatches each channel using only the triggering event and starts once', async () => {
    const s = setup()
    s.events.set('event-a', {
      id: 'event-a',
      eventType: 'order.created',
      payload: {},
    })
    await s.run('event', 'event-a')
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(s.notifications.dispatch).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'event-a',
    )
    expect(s.emailQueue.queue).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'event-a',
    )
    expect(s.email.dispatch).toHaveBeenCalledWith(
      new Date(0),
      50,
      true,
      'event-a',
    )
    expect(s.pushQueue.queue).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'event-a',
    )
    expect(s.push.dispatch).toHaveBeenCalledWith(
      new Date(0),
      50,
      true,
      'event-a',
    )
  })

  it('skips rolled-back IDs and leaves standalone auth email processing deduplicated', async () => {
    const s = setup()
    await s.run('event', 'rolled-back')
    expect(s.notifications.dispatch).not.toHaveBeenCalled()
    s.events.set('auth', {
      id: 'auth',
      eventType: 'auth.email_verification.requested',
      payload: {},
    })
    await s.run('event', 'auth')
    expect(s.emailQueue.queue).not.toHaveBeenCalled()
  })

  it('continues other channels after one stage fails and processes all eligible batches', async () => {
    const s = setup()
    s.events.set('event-a', {
      id: 'event-a',
      eventType: 'order.created',
      payload: {},
    })
    s.notifications.dispatch.mockRejectedValue(new Error('preparation failed'))
    s.push.dispatch.mockResolvedValueOnce({
      candidates: 50,
      accepted: 50,
      failed: 0,
      review: 0,
    })
    await s.run('event', 'event-a')
    expect(s.email.dispatch).toHaveBeenCalledTimes(1)
    expect(s.push.dispatch).toHaveBeenCalledTimes(2)
  })

  it('executes the exact refund and processes its resulting event in the same lifecycle', async () => {
    const s = setup()
    s.events.set('result', {
      id: 'result',
      eventType: 'payment.refund_succeeded',
      payload: {},
    })
    s.refunds.process.mockImplementation(async () => {
      recordRequestWork('event', 'result')
      return 'SUCCEEDED'
    })
    await s.run('refund', 'refund-a')
    expect(s.refunds.process).toHaveBeenCalledWith('refund-a')
    expect(s.notifications.dispatch).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'result',
    )
  })

  it('scopes cancellation to the closed order and campaign fanout to its approval event', async () => {
    const s = setup()
    s.events.set('cancel', {
      id: 'cancel',
      eventType: 'order.cancelled',
      payload: { orderId: 'order-a' },
    })
    await s.run('event', 'cancel')
    expect(s.cancellations.cancelBatch).toHaveBeenCalledWith(25, 'order-a')
    s.events.set('campaign', {
      id: 'campaign',
      eventType: 'push.campaign.approved',
      payload: {},
    })
    s.campaigns.fanout.mockResolvedValueOnce({ recipients: 50, failed: 0 })
    await s.run('event', 'campaign')
    expect(s.campaigns.fanout).toHaveBeenCalledTimes(2)
    expect(s.campaigns.fanout).toHaveBeenCalledWith(50, true, 'campaign')
  })

  it('prepares and processes only the activated media asset', async () => {
    const s = setup()
    s.events.set('media-a', {
      id: 'media-a',
      eventType: 'media.renditions',
      payload: {},
    })

    await s.run('media', 'media-a')
    expect(s.renditions.backfill).toHaveBeenCalledWith(1, 'media-a')
    expect(s.renditions.processBatch).toHaveBeenCalledTimes(1)
    expect(s.renditions.processBatch).toHaveBeenCalledWith(1, 'media-a')
  })

  it('runs an explicit media deletion retry only for its asset', async () => {
    const s = setup()
    await s.run('deletion', 'media-delete')
    expect(s.media.cleanupBatch).toHaveBeenCalledWith(1, 'media-delete')
    expect(s.emailQueue.queue).not.toHaveBeenCalled()
  })

  it('keeps explicit in-app receipt retry scoped to the in-app subscriber', async () => {
    const s = setup()
    await s.run('notification', 'notification-retry')
    expect(s.notifications.dispatch).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'notification-retry',
    )
    expect(s.emailQueue.queue).not.toHaveBeenCalled()
    expect(s.pushQueue.queue).not.toHaveBeenCalled()
  })

  it('finds trigger-created stock events only for the touched balance and current request', async () => {
    const s = setup()
    s.events.set('low', {
      id: 'low',
      eventType: 'inventory.low_stock',
      payload: {},
    })
    s.db.client.outboxEvent.findMany.mockResolvedValue([{ id: 'low' }])
    const scope = await s.run('inventory', 'balance-a')
    expect(s.db.client.outboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        eventType: 'inventory.low_stock',
        payload: { path: ['balanceId'], equals: 'balance-a' },
        createdAt: { gte: scope.createdAt },
      },
      select: { id: true },
    })
    expect(s.notifications.dispatch).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'low',
    )
  })

  it('does no background work for a read-only response', async () => {
    const s = setup()
    const scope = newRequestWork()
    s.actions.start(scope)
    expect(waitUntil).not.toHaveBeenCalled()
    const interceptor = new RequestWorkInterceptor(s.actions)
    await expect(
      lastValueFrom(
        interceptor.intercept({} as ExecutionContext, {
          handle: () => of('ok'),
        }),
      ),
    ).resolves.toBe('ok')
    expect(waitUntil).not.toHaveBeenCalled()
  })
})
