import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service'
import { PushQueue } from '../push/push-queue.service'
import { PushDispatcher } from '../push/push-dispatcher.service'
import { PushProvider } from '../push/push.provider'
import { PushCampaignsService } from '../push/push-campaigns.service'
import { MediaRenditionService } from '../media/media-rendition.service'
import { MediaService } from '../media/media.service'
import { S3MediaProvider } from '../media/s3.storage'
import { DiskMediaProvider } from '../media/disk.storage'
import { MediaStorageRegistry } from '../media/storage.registry'
import { MediaCdnPurgeService } from '../media/cdn-purge.service'
import { PaymentCancellationService } from '../payments/payment-cancellation.service'
import { StripeTestGateway } from '../payments/providers/stripe-gateway'

const config = {
  get: (key: string) => (key === 'STRIPE_TEST_ENABLED' ? true : 'controlled'),
} as unknown as ConfigService<Environment, true>

describe('request-triggered workers preserve resource filters', () => {
  it('restricts in-app and push planning to the supplied event', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const db = {
      client: { outboxEvent: { findMany } },
    } as unknown as DatabaseService
    await new NotificationDispatcher(db).dispatch(
      new Date(0),
      1,
      true,
      'event-a',
    )
    await new PushQueue(db, config).queue(new Date(0), 1, true, 'event-a')
    expect(findMany).toHaveBeenCalledTimes(2)
    for (const [query] of findMany.mock.calls)
      expect(query.where.id).toBe('event-a')
  })

  it('restricts push dispatch and expired leases to the supplied event', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const db = {
      client: { pushDelivery: { findMany } },
    } as unknown as DatabaseService
    await new PushDispatcher(db, config, {} as PushProvider).dispatch(
      new Date(0),
      1,
      true,
      'event-a',
    )
    expect(findMany).toHaveBeenCalledTimes(2)
    for (const [query] of findMany.mock.calls)
      expect(query.where.eventId).toBe('event-a')
  })

  it('keeps campaign approval scope alongside schedule and retry eligibility', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const db = {
      client: {
        $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
        pushCampaign: { findMany },
      },
    } as unknown as DatabaseService
    await new PushCampaignsService(db, config).fanout(50, true, 'approval-a')
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      eventId: 'approval-a',
      status: { in: ['SCHEDULED', 'FANOUT'] },
      fanoutAttempts: { lt: 5 },
    })
  })

  it('restricts rendition preparation, recovery and processing to the supplied media', async () => {
    const assets = jest.fn().mockResolvedValue([])
    const events = jest.fn().mockResolvedValue([])
    const updateMany = jest.fn().mockResolvedValue({ count: 0 })
    const db = {
      client: {
        mediaAsset: { findMany: assets },
        outboxEvent: { findMany: events, updateMany },
      },
    } as unknown as DatabaseService
    const renditions = new MediaRenditionService(
      db,
      config,
      {} as S3MediaProvider,
      {} as DiskMediaProvider,
    )
    await renditions.backfill(1, 'media-a')
    await renditions.processBatch(1, 'media-a')
    expect(assets.mock.calls[0]![0].where.id).toBe('media-a')
    expect(events.mock.calls[0]![0].where.id).toBe('media-a')
    expect(updateMany.mock.calls[0]![0].where.id).toBe('media-a')
  })

  it('restricts deletion preparation, lease recovery and provider candidates to the supplied asset', async () => {
    const assets = jest.fn().mockResolvedValue([])
    const jobs = jest.fn().mockResolvedValue([])
    const updateMany = jest.fn().mockResolvedValue({ count: 0 })
    const db = {
      client: {
        mediaAsset: { findMany: assets },
        mediaDeletionJob: { findMany: jobs, updateMany },
      },
    } as unknown as DatabaseService
    const media = new MediaService(
      db,
      config,
      {} as MediaStorageRegistry,
      {} as DiskMediaProvider,
      {} as MediaCdnPurgeService,
      {} as S3MediaProvider,
    )
    await media.cleanupBatch(1, 'media-a')
    expect(assets.mock.calls[0]![0].where.id).toBe('media-a')
    expect(jobs.mock.calls[0]![0].where.mediaId).toBe('media-a')
    expect(updateMany.mock.calls[0]![0].where.mediaId).toBe('media-a')
  })

  it('restricts cancellation work to the supplied closed order', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const db = {
      client: { paymentAttempt: { findMany } },
    } as unknown as DatabaseService
    await new PaymentCancellationService(
      db,
      config,
      {} as StripeTestGateway,
    ).cancelBatch(1, 'order-a')
    expect(findMany.mock.calls[0]![0].where.orderId).toBe('order-a')
  })
})
