import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { publicContentWindow } from '../merchandising/merchandising.policy'
import { responsiveImage } from '../media/responsive'
type Tx = Prisma.TransactionClient
type Asset = Prisma.MediaAssetGetPayload<Record<string, never>>
export async function publicPushTarget(
  tx: Tx,
  type: string,
  id: string | null,
) {
  if (type === 'HOME') {
    if (id) throw new ConflictException('HOME must not specify a target ID')
    return '/'
  }
  if (!id) throw new ConflictException('Canonical target ID required')
  if (type === 'PRODUCT') {
    const row = await tx.product.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { slug: true },
    })
    if (row) return '/product/' + row.slug
  }
  if (type === 'CATEGORY') {
    const row = await tx.category.findFirst({
      where: { id, active: true },
      select: { slug: true },
    })
    if (row) return '/shop?category=' + encodeURIComponent(row.slug)
  }
  const clock = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
  if (type === 'COLLECTION') {
    const row = await tx.featuredCollection.findFirst({
      where: {
        id,
        ...publicContentWindow(clock[0]!.now),
        products: { some: { product: { status: 'ACTIVE' } } },
      },
      select: { slug: true },
    })
    if (row) return '/collections/' + row.slug
  }
  if (type === 'OFFER') {
    const row = await tx.promotionCampaign.findFirst({
      where: {
        id,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        startsAt: { lte: clock[0]!.now },
        endsAt: { gt: clock[0]!.now },
      },
      select: { id: true },
    })
    if (row) return '/shop'
  }
  throw new NotFoundException('Published push target unavailable')
}
export function pushImage(asset: Asset | null, namespace: string, alt: string) {
  if (
    !asset ||
    asset.status !== 'ACTIVE' ||
    asset.namespace !== namespace ||
    !asset.objectKey.startsWith(namespace + '/') ||
    !asset.providerAssetId ||
    !asset.publicUrl ||
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
export async function lockPushImage(tx: Tx, id: string, namespace: string) {
  const locked = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM media_assets WHERE id=${id}::uuid FOR UPDATE`
  if (!locked.length)
    throw new ConflictException('Verified campaign image unavailable')
  const asset = await tx.mediaAsset.findUniqueOrThrow({
    where: { id },
    include: { deletionJob: true },
  })
  if (asset.deletionJob?.status === 'PROCESSING')
    throw new ConflictException('Image deletion in progress')
  if (
    asset.status === 'PENDING_DELETE' &&
    asset.deletionJob?.status === 'PENDING'
  ) {
    const active = { ...asset, status: 'ACTIVE' as const }
    if (!pushImage(active, namespace, '') || asset.bytes > 10485760)
      throw new ConflictException('Invalid campaign image')
    await tx.mediaDeletionJob.update({
      where: { mediaId: id },
      data: { status: 'CANCELLED' },
    })
    await tx.mediaAsset.update({ where: { id }, data: { status: 'ACTIVE' } })
    return
  }
  if (!pushImage(asset, namespace, '') || asset.bytes > 10485760)
    throw new ConflictException('Image must be verified and reusable')
}
