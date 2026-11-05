import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { expect, type APIRequestContext } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

export const bannerInput = {
  expectedRevision: 0,
  headline: 'merchandising New arrivals',
  subtitle: 'Curated picks',
  ctaText: 'Shop now',
  ctaHref: '/shop?tag=new',
  slot: 'hero',
  position: 1,
  status: 'DRAFT',
  startsAt: null,
  endsAt: null,
  imageMediaId: null,
  imageAlt: '',
}
const namespace = 'projects/kookaburra/products'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAYAAACqnKHoAAAAvklEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GOj0gABFJKdrgAAAABJRU5ErkJggg==',
  'base64',
)

export class MerchandisingFixture extends CatalogTestFixture {
  readonly bannerIds: string[] = []
  readonly collectionIds: string[] = []
  readonly mediaIds: string[] = []
  private readonly diskIds: string[] = []
  constructor(readonly http: APIRequestContext) {
    super(http)
  }

  async banner(token: string, overrides: Record<string, unknown> = {}) {
    const response = await this.http.post('/v1/admin/store/banners', {
      headers: bearer(token),
      data: { ...bannerInput, ...overrides },
    })
    expect(response.status()).toBe(201)
    const row = (await response.json()) as { id: string; revision: number }
    this.bannerIds.push(row.id)
    return row
  }
  async product(token: string, label: string, status = 'ACTIVE') {
    const category = await this.http.post('/v1/admin/categories', {
      headers: bearer(token),
      data: { name: 'merchandising Category', slug: this.slug(label + '-category') },
    })
    expect(category.status()).toBe(201)
    const categoryId = (await category.json()).id as string
    const response = await this.http.post('/v1/admin/products', {
      headers: bearer(token),
      data: {
        title: 'merchandising ' + label,
        slug: this.slug(label),
        sku: this.sku(label),
        priceMinor: 1299,
        currency: 'USD',
        status,
        stockOnHand: 4,
        categoryIds: [categoryId],
      },
    })
    expect(response.status()).toBe(201)
    return (await response.json()) as { id: string; slug: string }
  }
  async collection(
    token: string,
    productIds: string[],
    overrides: Record<string, unknown> = {},
  ) {
    const input = {
      expectedRevision: 0,
      title: 'merchandising Collection ' + this.key + this.collectionIds.length,
      slug: this.slug('collection-' + this.collectionIds.length),
      description: 'Curated products',
      position: 1,
      status: 'DRAFT',
      startsAt: null,
      endsAt: null,
      productIds,
      ...overrides,
    }
    const response = await this.http.post('/v1/admin/store/collections', {
      headers: bearer(token),
      data: input,
    })
    expect(response.status()).toBe(201)
    const row = (await response.json()) as {
      id: string
      revision: number
      slug: string
    }
    this.collectionIds.push(row.id)
    return { ...row, input }
  }
  async asset(overrides: Record<string, unknown> = {}) {
    const id = randomUUID()
    // Test-only verified provider fixture; no external storage/network call.
    await this.db.mediaAsset.create({
      data: {
        id,
        provider: 'cloudinary',
        namespace,
        objectKey: namespace + '/' + id,
        providerAssetId: 'fixture-' + id,
        mimeType: 'image/png',
        bytes: 512,
        width: 960,
        height: 640,
        publicUrl: 'https://cdn.example.test/' + id + '.png',
        status: 'ACTIVE',
        uploadExpiresAt: new Date(Date.now() + 3600000),
        ...overrides,
      },
    })
    this.mediaIds.push(id)
    return id
  }
  async diskAsset(token: string) {
    expect(process.env.MEDIA_PROVIDER).toBe('disk')
    const response = await this.http.post('/v1/admin/media/uploads', {
      headers: bearer(token),
      data: { mimeType: 'image/png', bytes: png.length },
    })
    expect(response.status()).toBe(201)
    const signed = (await response.json()) as {
      mediaId: string
      uploadUrl: string
      headers: Record<string, string>
    }
    this.mediaIds.push(signed.mediaId)
    this.diskIds.push(signed.mediaId)
    expect(
      (
        await this.http.put(new URL(signed.uploadUrl).pathname, {
          headers: signed.headers,
          data: png,
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await this.http.post(
          '/v1/admin/media/' + signed.mediaId + '/complete',
          { headers: bearer(token) },
        )
      ).status(),
    ).toBe(201)
    return signed.mediaId
  }

  override async close() {
    try {
      const ids = [...this.bannerIds, ...this.collectionIds]
      if (ids.length)
        await this.db.outboxEvent.deleteMany({
          where: {
            eventType: 'store.content.changed',
            OR: ids.map((id) => ({ payload: { path: ['id'], equals: id } })),
          },
        })
      await this.db.storeBanner.deleteMany({
        where: { id: { in: this.bannerIds } },
      })
      await this.db.featuredCollection.deleteMany({
        where: { id: { in: this.collectionIds } },
      })
      await this.db.productMedia.deleteMany({
        where: { mediaId: { in: this.mediaIds } },
      })
      await this.db.outboxEvent.deleteMany({
        where: { id: { in: this.mediaIds }, eventType: 'media.renditions' },
      })
      await this.db.mediaDeletionJob.deleteMany({
        where: { mediaId: { in: this.mediaIds } },
      })
      await this.db.mediaAsset.deleteMany({
        where: { id: { in: this.mediaIds } },
      })
      for (const id of this.diskIds) {
        const root = process.env.MEDIA_DISK_ROOT
        if (!root || process.env.API_TEST_MODE !== 'db')
          throw new Error('Refusing unsafe disk fixture cleanup')
        const file = resolve(root, ...namespace.split('/'), id)
        const rel = relative(resolve(root), file)
        if (!rel || rel.startsWith('..'))
          throw new Error('Unsafe disk fixture cleanup path')
        await rm(file, { force: true })
      }
    } finally {
      await super.close()
    }
  }
}
