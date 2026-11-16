import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { DatabaseService } from '../database/database.service'
import { MerchandisingService } from './merchandising.service'

describe('merchandising public projection safety (execution deferred to release acceptance)', () => {
  it('uses a bounded cold-connection wait for both repeatable-read public snapshots', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ now: new Date('2026-11-16T00:00:00Z') }]),
      storeBanner: { findMany: jest.fn().mockResolvedValue([]) },
      featuredCollection: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'collection',
            slug: 'new-arrivals',
            products: [],
          }),
      },
    }
    const transaction = jest
      .fn()
      .mockImplementation((work: (client: typeof tx) => unknown) => work(tx))
    const db = {
      client: { $transaction: transaction },
    } as unknown as DatabaseService
    const config = { get: () => 'projects/eshop' } as unknown as ConfigService<
      Environment,
      true
    >
    const service = new MerchandisingService(db, config)
    await service.homepage()
    await service.collectionBySlug('new-arrivals')
    expect(transaction).toHaveBeenCalledTimes(2)
    for (const call of transaction.mock.calls) {
      expect(call[1]).toEqual({
        isolationLevel: 'RepeatableRead',
        maxWait: 5000,
        timeout: 8000,
      })
    }
  })
  it('has a deterministic public-only revision and never exposes admin/storage fields', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ now: new Date('2026-11-02T00:00:00Z') }]),
      storeBanner: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'banner',
            headline: 'New arrivals',
            subtitle: '',
            ctaText: 'Shop now',
            ctaHref: '/shop',
            slot: 'hero',
            position: 1,
            imageMediaId: null,
            imageMedia: null,
            imageAlt: '',
            revision: 100,
            internalSecret: 'must-not-leak',
          },
        ]),
      },
      featuredCollection: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const db = {
      client: {
        $transaction: (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      },
    } as unknown as DatabaseService
    const config = {
      get: () => 'projects/kookaburra/products',
    } as unknown as ConfigService<Environment, true>
    const service = new MerchandisingService(db, config)
    const first = await service.homepage()
    expect(first.banners).toEqual([
      {
        id: 'banner',
        headline: 'New arrivals',
        subtitle: '',
        ctaText: 'Shop now',
        ctaHref: '/shop',
        slot: 'hero',
        position: 1,
        image: null,
      },
    ])
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/)
    expect((await service.homepage()).revision).toBe(first.revision)
    expect(JSON.stringify(first)).not.toMatch(
      /internalSecret|must-not-leak|providerAssetId|objectKey|imageMediaId/,
    )
  })
})
