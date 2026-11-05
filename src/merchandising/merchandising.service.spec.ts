import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { DatabaseService } from '../database/database.service'
import { MerchandisingService } from './merchandising.service'

describe('merchandising public projection safety (execution deferred to release acceptance)', () => {
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
