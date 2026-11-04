import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  SaveFeaturedCollectionDto,
  SaveStoreBannerDto,
} from './merchandising.dto'

const rules = { whitelist: true, forbidNonWhitelisted: true }
const banner = {
  expectedRevision: 0,
  status: 'DRAFT',
  position: 1,
  headline: 'New arrivals',
  subtitle: '',
  ctaText: 'Shop now',
  ctaHref: '/shop',
  slot: 'hero',
  imageMediaId: null,
  imageAlt: '',
}
const collection = {
  expectedRevision: 0,
  status: 'PUBLISHED',
  position: 1,
  title: 'New arrivals',
  slug: 'new-arrivals',
  description: '',
  productIds: ['00000000-0000-4000-8000-000000000001'],
}

describe('G5 strict merchandising DTOs (execution deferred to G12)', () => {
  it('accepts canonical bounded banner/collection editor fields', async () => {
    expect(
      await validate(plainToInstance(SaveStoreBannerDto, banner), rules),
    ).toHaveLength(0)
    expect(
      await validate(
        plainToInstance(SaveFeaturedCollectionDto, collection),
        rules,
      ),
    ).toHaveLength(0)
  })
  it.each([
    { role: 'OWNER' },
    { imageUrl: 'https://elsewhere.test/image.png' },
    { enabled: true },
    { expectedRevision: -1 },
    { position: 100 },
    { slot: 'unknown' },
    { status: 'Scheduled' },
    { headline: '<script>' },
    { headline: 'Valid\n' },
    { subtitle: 'Bad\u007f' },
    { imageMediaId: 'fixture-image' },
    { startsAt: '2026-11-02' },
  ])('rejects invalid banner fields %j', async (bad) => {
    expect(
      (
        await validate(
          plainToInstance(SaveStoreBannerDto, { ...banner, ...bad }),
          rules,
        )
      ).length,
    ).toBeGreaterThan(0)
  })
  it.each([
    { productIds: [] },
    { productIds: ['fixture-product'] },
    { productIds: [collection.productIds[0], collection.productIds[0]] },
    { productIds: Array(51).fill(collection.productIds[0]) },
    { slug: 'https://outside.test' },
    { title: '<iframe>' },
    { title: 'Valid\n' },
    { priceMinor: 1 },
    { status: 'ACTIVE' },
  ])(
    'rejects invalid membership, text and server-owned fields %j',
    async (bad) => {
      expect(
        (
          await validate(
            plainToInstance(SaveFeaturedCollectionDto, {
              ...collection,
              ...bad,
            }),
            rules,
          )
        ).length,
      ).toBeGreaterThan(0)
    },
  )
})
