import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { responsiveImage } from '../media/responsive'
import {
  AdminFeaturedCollectionDto,
  AdminStoreBannerDto,
  MerchandisingImageDto,
  MerchandisingPageQueryDto,
  PublicFeaturedCollectionDto,
  PublicHomepageDto,
  SaveFeaturedCollectionDto,
  SaveStoreBannerDto,
} from './merchandising.dto'
import {
  contentWindow,
  publicContentWindow,
  safeContentHref,
} from './merchandising.policy'

const bannerInclude = { imageMedia: true } as const
const adminCollectionInclude = {
  products: {
    orderBy: { position: 'asc' as const },
    select: { productId: true },
  },
}
const publicProductSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  priceMinor: true,
  currency: true,
  compareAtMinor: true,
  badge: true,
  tag: true,
  hasVariants: true,
  categories: { select: { categoryId: true } },
  inventoryBalance: { select: { onHand: true, reservedQuantity: true } },
  variants: {
    select: {
      inventoryBalance: { select: { onHand: true, reservedQuantity: true } },
    },
  },
  media: { orderBy: { position: 'asc' as const }, include: { media: true } },
} as const satisfies Prisma.ProductSelect
const publicCollectionInclude = {
  products: {
    orderBy: { position: 'asc' as const },
    where: { product: { status: 'ACTIVE' as const } },
    include: { product: { select: publicProductSelect } },
  },
}
type Banner = Prisma.StoreBannerGetPayload<{ include: typeof bannerInclude }>
type AdminCollection = Prisma.FeaturedCollectionGetPayload<{
  include: typeof adminCollectionInclude
}>
type PublicCollection = Prisma.FeaturedCollectionGetPayload<{
  include: typeof publicCollectionInclude
}>
type ProductCard = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect
}>
type Asset = Prisma.MediaAssetGetPayload<Record<string, never>>

const text = (value: string, minimum: number, field: string) => {
  const result = value.trim()
  if (result.length < minimum)
    throw new BadRequestException(field + ' is blank or too short')
  return result
}

@Injectable()
export class MerchandisingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private conflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    )
      throw new ConflictException(
        'Content changed, slug/title already exists or reference unavailable. Reload and retry.',
      )
    throw error
  }

  private revision(id: string | null, revision: number) {
    if ((!id && revision !== 0) || (id && revision === 0))
      throw new BadRequestException('Invalid expected revision')
  }

  private image(
    asset: Asset | null,
    alt: string,
  ): MerchandisingImageDto | null {
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    if (
      !asset ||
      asset.status !== 'ACTIVE' ||
      !asset.providerAssetId ||
      !asset.publicUrl ||
      asset.namespace !== namespace ||
      !asset.objectKey.startsWith(namespace + '/') ||
      asset.width < 1 ||
      asset.height < 1 ||
      asset.bytes < 1 ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(
        asset.mimeType,
      )
    )
      return null
    return {
      id: asset.id,
      url: asset.publicUrl,
      alt,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
      ...responsiveImage(
        asset.provider,
        asset.publicUrl,
        asset.width,
        asset.renditions,
      ),
    }
  }

  private publicBanner(row: Banner) {
    const image = this.image(row.imageMedia, row.imageAlt)
    if (!safeContentHref(row.ctaHref) || (row.imageMediaId && !image))
      return null
    return {
      id: row.id,
      headline: row.headline,
      subtitle: row.subtitle,
      ctaText: row.ctaText,
      ctaHref: row.ctaHref,
      slot: row.slot,
      position: row.position,
      image,
    }
  }

  private adminBanner(row: Banner): AdminStoreBannerDto {
    return {
      id: row.id,
      headline: row.headline,
      subtitle: row.subtitle,
      ctaText: row.ctaText,
      ctaHref: row.ctaHref,
      slot: row.slot,
      position: row.position,
      image: this.image(row.imageMedia, row.imageAlt),
      imageMediaId: row.imageMediaId,
      imageAlt: row.imageAlt,
      status: row.status,
      revision: row.revision,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }
  }

  private adminCollection(row: AdminCollection): AdminFeaturedCollectionDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      position: row.position,
      productIds: row.products.map((link) => link.productId),
      status: row.status,
      revision: row.revision,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }
  }

  private product(row: ProductCard) {
    const available = (
      balance: { onHand: number; reservedQuantity: number } | null,
    ) => Math.max(0, (balance?.onHand ?? 0) - (balance?.reservedQuantity ?? 0))
    const firstImage =
      row.media
        .map((link) => this.image(link.media, link.altText))
        .find((image) => image !== null) ?? null
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      priceMinor: row.priceMinor,
      currency: row.currency,
      compareAtMinor: row.compareAtMinor,
      badge: row.badge,
      tag: row.tag,
      hasVariants: row.hasVariants,
      categoryIds: row.categories.map((category) => category.categoryId),
      availableQuantity: row.hasVariants
        ? row.variants.reduce(
            (sum, variant) => sum + available(variant.inventoryBalance),
            0,
          )
        : available(row.inventoryBalance),
      image: firstImage,
    }
  }

  private publicCollection(
    row: PublicCollection,
    maxCards: number,
  ): PublicFeaturedCollectionDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      position: row.position,
      productIds: row.products.map((link) => link.productId),
      productCount: row.products.length,
      products: row.products
        .slice(0, maxCards)
        .map((link) => this.product(link.product)),
      productsTruncated: row.products.length > maxCards,
    }
  }

  private async record(
    tx: Prisma.TransactionClient,
    actorId: string,
    kind: string,
    id: string,
    revision: number,
    status: string,
  ) {
    await tx.auditEvent.create({
      data: {
        actorId,
        action: 'store.' + kind + '.saved',
        targetType: kind,
        targetId: id,
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'store.content.changed',
        payload: { kind, id, revision, status },
      },
    })
  }

  private async reusableImage(tx: Prisma.TransactionClient, id: string) {
    const found = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM media_assets WHERE id = ${id}::uuid FOR UPDATE`
    if (!found.length) throw new ConflictException('Banner image unavailable')
    const asset = await tx.mediaAsset.findUniqueOrThrow({
      where: { id },
      include: { deletionJob: true },
    })
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    if (
      asset.namespace !== namespace ||
      !asset.objectKey.startsWith(namespace + '/') ||
      !asset.providerAssetId ||
      !asset.publicUrl ||
      asset.bytes < 1 ||
      asset.bytes > 10485760 ||
      asset.width < 1 ||
      asset.height < 1 ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(
        asset.mimeType,
      ) ||
      !(
        asset.status === 'ACTIVE' ||
        (asset.status === 'PENDING_DELETE' &&
          asset.deletionJob?.status === 'PENDING')
      ) ||
      asset.deletionJob?.status === 'PROCESSING'
    )
      throw new ConflictException('Banner image must be verified and reusable')
    if (asset.status === 'PENDING_DELETE') {
      await tx.mediaDeletionJob.update({
        where: { mediaId: id },
        data: { status: 'CANCELLED' },
      })
      await tx.mediaAsset.update({ where: { id }, data: { status: 'ACTIVE' } })
    }
  }

  async saveBanner(
    id: string | null,
    input: SaveStoreBannerDto,
    actorId: string,
  ) {
    this.revision(id, input.expectedRevision)
    if (!safeContentHref(input.ctaHref))
      throw new BadRequestException(
        'CTA must be an approved same-site store route',
      )
    if (input.status === 'ARCHIVED' && input.imageMediaId)
      throw new BadRequestException('Archived banners must detach their image')
    const values = {
      headline: text(input.headline, 3, 'Headline'),
      subtitle: input.subtitle.trim(),
      ctaText: text(input.ctaText, 2, 'CTA'),
      ctaHref: input.ctaHref,
      slot: input.slot,
      position: input.position,
      status: input.status,
      ...contentWindow(input.startsAt, input.endsAt),
      imageMediaId: input.imageMediaId ?? null,
      imageAlt: input.imageMediaId
        ? text(input.imageAlt, 1, 'Image alt')
        : input.imageAlt.trim(),
    }
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          if (values.imageMediaId)
            await this.reusableImage(tx, values.imageMediaId)
          let saved
          if (id) {
            if (
              !(await tx.storeBanner.findUnique({
                where: { id },
                select: { id: true },
              }))
            )
              throw new NotFoundException('Banner not found')
            const changed = await tx.storeBanner.updateMany({
              where: { id, revision: input.expectedRevision },
              data: { ...values, revision: { increment: 1 } },
            })
            if (changed.count !== 1)
              throw new ConflictException('Banner changed. Reload and retry.')
            saved = await tx.storeBanner.findUniqueOrThrow({
              where: { id },
              include: bannerInclude,
            })
          } else
            saved = await tx.storeBanner.create({
              data: values,
              include: bannerInclude,
            })
          await this.record(
            tx,
            actorId,
            'banner',
            saved.id,
            saved.revision,
            saved.status,
          )
          return this.adminBanner(saved)
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      this.conflict(error)
    }
  }

  async saveCollection(
    id: string | null,
    input: SaveFeaturedCollectionDto,
    actorId: string,
  ) {
    this.revision(id, input.expectedRevision)
    const values = {
      title: text(input.title, 3, 'Collection title'),
      slug: input.slug,
      description: input.description.trim(),
      position: input.position,
      status: input.status,
      ...contentWindow(input.startsAt, input.endsAt),
    }
    if (
      new Set(input.productIds).size !== input.productIds.length ||
      input.productIds.length < 1 ||
      input.productIds.length > 50
    )
      throw new BadRequestException('Select 1–50 unique canonical products')
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          // Same ordering for overlapping collections; prevent archive during publication validation.
          for (const productId of [...input.productIds].sort())
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`
          const products = await tx.product.findMany({
            where: { id: { in: input.productIds } },
            select: { id: true, status: true },
          })
          if (products.length !== input.productIds.length)
            throw new BadRequestException('Unknown product ID')
          if (
            input.status === 'PUBLISHED' &&
            products.some((product) => product.status !== 'ACTIVE')
          )
            throw new ConflictException(
              'Only ACTIVE products can be published in a collection',
            )
          let collectionId: string
          if (id) {
            if (
              !(await tx.featuredCollection.findUnique({
                where: { id },
                select: { id: true },
              }))
            )
              throw new NotFoundException('Collection not found')
            const changed = await tx.featuredCollection.updateMany({
              where: { id, revision: input.expectedRevision },
              data: { ...values, revision: { increment: 1 } },
            })
            if (changed.count !== 1)
              throw new ConflictException(
                'Collection changed. Reload and retry.',
              )
            collectionId = id
            await tx.featuredCollectionProduct.deleteMany({
              where: { collectionId },
            })
          } else
            collectionId = (
              await tx.featuredCollection.create({ data: values })
            ).id
          await tx.featuredCollectionProduct.createMany({
            data: input.productIds.map((productId, position) => ({
              collectionId,
              productId,
              position,
            })),
          })
          const saved = await tx.featuredCollection.findUniqueOrThrow({
            where: { id: collectionId },
            include: adminCollectionInclude,
          })
          await this.record(
            tx,
            actorId,
            'featured_collection',
            saved.id,
            saved.revision,
            saved.status,
          )
          return this.adminCollection(saved)
        },
        { timeout: 15000 },
      )
    } catch (error) {
      this.conflict(error)
    }
  }

  async getBanner(id: string) {
    const row = await this.db.client.storeBanner.findUnique({
      where: { id },
      include: bannerInclude,
    })
    if (!row) throw new NotFoundException('Banner not found')
    return this.adminBanner(row)
  }
  async getCollection(id: string) {
    const row = await this.db.client.featuredCollection.findUnique({
      where: { id },
      include: adminCollectionInclude,
    })
    if (!row) throw new NotFoundException('Collection not found')
    return this.adminCollection(row)
  }

  async listBanners(query: MerchandisingPageQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20
    const where = query.status ? { status: query.status } : {}
    const [rows, total] = await this.db.client.$transaction([
      this.db.client.storeBanner.findMany({
        where,
        include: bannerInclude,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.storeBanner.count({ where }),
    ])
    return {
      items: rows.map((row) => this.adminBanner(row)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }
  async listCollections(query: MerchandisingPageQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20
    const where = query.status ? { status: query.status } : {}
    const [rows, total] = await this.db.client.$transaction([
      this.db.client.featuredCollection.findMany({
        where,
        include: adminCollectionInclude,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.featuredCollection.count({ where }),
    ])
    return {
      items: rows.map((row) => this.adminCollection(row)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }

  async archive(
    id: string,
    revision: number,
    actorId: string,
    collection = false,
  ) {
    return this.db.client.$transaction(async (tx) => {
      const found = collection
        ? await tx.featuredCollection.findUnique({
            where: { id },
            select: { id: true },
          })
        : await tx.storeBanner.findUnique({
            where: { id },
            select: { id: true },
          })
      if (!found) throw new NotFoundException('Content not found')
      const changed = collection
        ? await tx.featuredCollection.updateMany({
            where: { id, revision },
            data: { status: 'ARCHIVED', revision: { increment: 1 } },
          })
        : await tx.storeBanner.updateMany({
            where: { id, revision },
            data: {
              status: 'ARCHIVED',
              imageMediaId: null,
              revision: { increment: 1 },
            },
          })
      if (changed.count !== 1)
        throw new ConflictException('Content changed. Reload and retry.')
      await this.record(
        tx,
        actorId,
        collection ? 'featured_collection' : 'banner',
        id,
        revision + 1,
        'ARCHIVED',
      )
      // Detachment is atomic. Reconciliation applies normal retention; shared media remains protected.
      return { archived: true as const, revision: revision + 1 }
    })
  }

  async homepage(): Promise<PublicHomepageDto> {
    return this.db.client.$transaction(
      async (tx) => {
        const clock = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
        const window = publicContentWindow(clock[0]!.now)
        const banners = await tx.storeBanner.findMany({
          where: window,
          include: bannerInclude,
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          take: 21,
        })
        const collections = await tx.featuredCollection.findMany({
          where: {
            ...window,
            products: { some: { product: { status: 'ACTIVE' } } },
          },
          include: publicCollectionInclude,
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          take: 13,
        })
        const data = {
          banners: banners
            .slice(0, 20)
            .map((row) => this.publicBanner(row))
            .filter((row) => row !== null),
          collections: collections
            .slice(0, 12)
            .map((row) => this.publicCollection(row, 8)),
          bannersTruncated: banners.length > 20,
          collectionsTruncated: collections.length > 12,
        }
        return {
          schemaVersion: 1,
          revision: createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex'),
          ...data,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  async collectionBySlug(slug: string) {
    return this.db.client.$transaction(
      async (tx) => {
        const clock = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
        const row = await tx.featuredCollection.findFirst({
          where: {
            slug,
            ...publicContentWindow(clock[0]!.now),
            products: { some: { product: { status: 'ACTIVE' } } },
          },
          include: publicCollectionInclude,
        })
        if (!row) throw new NotFoundException('Published collection not found')
        return this.publicCollection(row, 50)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }
}
