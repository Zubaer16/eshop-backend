import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { allocateDiscount } from './promotions.policy'
import {
  PromotionPageQueryDto,
  SaveCouponDto,
  SavePromotionCampaignDto,
} from './promotions.dto'

type PromotionLine = {
  id: string
  quantity: number
  product: { priceMinor: number; categories: { categoryId: string }[] }
  variant: { priceMinor: number | null } | null
}

function windowDates(startsAt?: string | null, endsAt?: string | null) {
  const start = startsAt ? new Date(startsAt) : null
  const end = endsAt ? new Date(endsAt) : null
  if (
    (start && !Number.isFinite(start.getTime())) ||
    (end && !Number.isFinite(end.getTime())) ||
    (start && end && start >= end)
  )
    throw new BadRequestException('Start must precede exclusive end')
  return { startsAt: start, endsAt: end }
}

@Injectable()
export class PromotionsService {
  constructor(private readonly db: DatabaseService) {}

  private conflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    )
      throw new ConflictException(
        'Promotion conflict. Check code, slug, references and revision.',
      )
    throw error
  }

  private revision(id: string | null, revision: number) {
    if ((!id && revision !== 0) || (id && revision === 0))
      throw new BadRequestException('Invalid expected revision')
  }

  async saveCoupon(id: string | null, input: SaveCouponDto, actorId: string) {
    this.revision(id, input.expectedRevision)
    if (input.kind === 'PERCENT' && input.value > 10000)
      throw new BadRequestException('Percentage must be 1–10000 basis points')
    const values = {
      code: input.code,
      kind: input.kind,
      value: input.value,
      currency: input.currency,
      minimumSubtotalMinor: input.minimumSubtotalMinor,
      maximumDiscountMinor: input.maximumDiscountMinor ?? null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      ...windowDates(input.startsAt, input.endsAt),
      categoryId: input.categoryId ?? null,
      campaignId: input.campaignId ?? null,
      enabled: input.enabled,
    }
    try {
      return await this.db.client.$transaction(async (tx) => {
        if (
          values.categoryId &&
          !(await tx.category.findUnique({ where: { id: values.categoryId } }))
        )
          throw new BadRequestException('Unknown category')
        if (
          values.campaignId &&
          !(await tx.promotionCampaign.findUnique({
            where: { id: values.campaignId },
          }))
        )
          throw new BadRequestException('Unknown promotion campaign')
        let coupon
        if (id) {
          const locked = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM coupons WHERE id = ${id}::uuid FOR UPDATE`
          if (!locked.length) throw new NotFoundException('Coupon not found')
          const result = await tx.coupon.updateMany({
            where: { id, revision: input.expectedRevision },
            data: { ...values, revision: { increment: 1 } },
          })
          if (result.count !== 1)
            throw new ConflictException('Coupon changed. Reload and retry.')
          coupon = await tx.coupon.findUniqueOrThrow({ where: { id } })
        } else coupon = await tx.coupon.create({ data: values })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: id
              ? 'promotion.coupon.updated'
              : 'promotion.coupon.created',
            targetType: 'coupon',
            targetId: coupon.id,
          },
        })
        return coupon
      })
    } catch (error) {
      this.conflict(error)
    }
  }

  async saveCampaign(
    id: string | null,
    input: SavePromotionCampaignDto,
    actorId: string,
  ) {
    this.revision(id, input.expectedRevision)
    if (input.title.trim().length < 3 || input.title !== input.title.trim())
      throw new BadRequestException(
        'Campaign title must be trimmed and at least three characters',
      )
    const values = {
      title: input.title,
      slug: input.slug,
      description: input.description,
      status: input.status,
      ...windowDates(input.startsAt, input.endsAt),
    }
    if (
      ['ACTIVE', 'SCHEDULED'].includes(input.status) &&
      (!values.startsAt || !values.endsAt)
    )
      throw new BadRequestException(
        'Active/scheduled campaigns require both timestamps',
      )
    try {
      return await this.db.client.$transaction(async (tx) => {
        let campaign
        if (id) {
          if (!(await tx.promotionCampaign.findUnique({ where: { id } })))
            throw new NotFoundException('Campaign not found')
          const result = await tx.promotionCampaign.updateMany({
            where: { id, revision: input.expectedRevision },
            data: { ...values, revision: { increment: 1 } },
          })
          if (result.count !== 1)
            throw new ConflictException('Campaign changed. Reload and retry.')
          campaign = await tx.promotionCampaign.findUniqueOrThrow({
            where: { id },
          })
        } else campaign = await tx.promotionCampaign.create({ data: values })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: id
              ? 'promotion.campaign.updated'
              : 'promotion.campaign.created',
            targetType: 'promotion_campaign',
            targetId: campaign.id,
          },
        })
        return campaign
      })
    } catch (error) {
      this.conflict(error)
    }
  }

  async listCoupons(query: PromotionPageQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20
    const where: Prisma.CouponWhereInput = query.search
      ? { code: { contains: query.search.trim().toUpperCase() } }
      : {}
    const [items, total] = await this.db.client.$transaction([
      this.db.client.coupon.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.client.coupon.count({ where }),
    ])
    return { items, total, page, limit, pages: Math.ceil(total / limit) }
  }

  async listCampaigns(query: PromotionPageQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20
    const where: Prisma.PromotionCampaignWhereInput = query.search
      ? { title: { contains: query.search.trim(), mode: 'insensitive' } }
      : {}
    const [items, total] = await this.db.client.$transaction([
      this.db.client.promotionCampaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.client.promotionCampaign.count({ where }),
    ])
    return { items, total, page, limit, pages: Math.ceil(total / limit) }
  }

  async getCoupon(id: string) {
    const row = await this.db.client.coupon.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Coupon not found')
    return row
  }

  async getCampaign(id: string) {
    const row = await this.db.client.promotionCampaign.findUnique({
      where: { id },
    })
    if (!row) throw new NotFoundException('Campaign not found')
    return row
  }

  /** Soft removal preserves coupon identity, immutable claims and financial history. */
  async disable(
    id: string,
    revision: number,
    actorId: string,
    campaign = false,
  ) {
    return this.db.client.$transaction(async (tx) => {
      const found = campaign
        ? await tx.promotionCampaign.findUnique({ where: { id } })
        : await tx.coupon.findUnique({ where: { id } })
      if (!found) throw new NotFoundException('Promotion not found')
      const result = campaign
        ? await tx.promotionCampaign.updateMany({
            where: { id, revision },
            data: { status: 'PAUSED', revision: { increment: 1 } },
          })
        : await tx.coupon.updateMany({
            where: { id, revision },
            data: { enabled: false, revision: { increment: 1 } },
          })
      if (result.count !== 1)
        throw new ConflictException('Promotion changed. Reload and retry.')
      await tx.auditEvent.create({
        data: {
          actorId,
          action: campaign
            ? 'promotion.campaign.paused'
            : 'promotion.coupon.disabled',
          targetType: campaign ? 'promotion_campaign' : 'coupon',
          targetId: id,
        },
      })
      return { disabled: true, revision: revision + 1, historyPreserved: true }
    })
  }

  /** Effective scheduling is evaluated against the database clock; no timer is required. */
  async publicCampaigns(query: PromotionPageQueryDto) {
    return this.db.client.$transaction(async (tx) => {
      const clock = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
      const now = clock[0]!.now
      return tx.promotionCampaign.findMany({
        where: {
          status: { in: ['ACTIVE', 'SCHEDULED'] },
          startsAt: { lte: now },
          endsAt: { gt: now },
          ...(query.search
            ? {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          slug: true,
          startsAt: true,
          endsAt: true,
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      })
    })
  }

  /** Claims count by authoritative hold/order lifecycle. Refunds never restore paid usage. */
  async usage(
    tx: Prisma.TransactionClient,
    couponId: string,
    customerId: string,
  ) {
    const [row] = await tx.$queryRaw<{ total: bigint; customer: bigint }[]>`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.customer_id = ${customerId}::uuid) AS customer
      FROM coupon_redemptions cr
      JOIN checkout_reservations r ON r.id = cr.reservation_id
      LEFT JOIN orders o ON o.reservation_id = r.id
      WHERE cr.coupon_id = ${couponId}::uuid AND (
        (r.status = 'ACTIVE' AND r.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) OR
        (r.status = 'CONSUMED' AND o.status IN ('PENDING_PAYMENT', 'PAID'))
      )`
    return { total: Number(row!.total), customer: Number(row!.customer) }
  }

  async couponUsage(id: string) {
    await this.getCoupon(id)
    return this.db.client.$transaction(async (tx) => {
      const usage = await this.usage(
        tx,
        id,
        '00000000-0000-0000-0000-000000000000',
      )
      return {
        activeClaims: usage.total,
        note: 'Unexpired holds + pending/paid orders; refunds do not reset paid usage',
      }
    })
  }

  async quote(
    tx: Prisma.TransactionClient,
    customerId: string,
    currency: string,
    subtotalMinor: number,
    lines: PromotionLine[],
    code?: string,
    claim = false,
  ) {
    if (!code)
      return {
        couponId: null,
        couponCode: null,
        snapshot: null,
        discountMinor: 0,
        lineDiscounts: {} as Record<string, number>,
      }
    // Cart is locked before coupon. Administrative updates never acquire cart/order locks.
    if (claim)
      await tx.$queryRaw`SELECT id FROM coupons WHERE code = ${code} FOR UPDATE`
    const coupon = await tx.coupon.findUnique({
      where: { code },
      include: { campaign: true },
    })
    const clock = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
    const now = clock[0]!.now
    const invalid = () =>
      new UnprocessableEntityException('Coupon is not eligible for this cart')
    if (
      !coupon ||
      !coupon.enabled ||
      coupon.currency !== currency ||
      subtotalMinor < coupon.minimumSubtotalMinor ||
      (coupon.startsAt && now < coupon.startsAt) ||
      (coupon.endsAt && now >= coupon.endsAt)
    )
      throw invalid()
    let campaign = coupon.campaign
    if (claim && coupon.campaignId) {
      await tx.$queryRaw`SELECT id FROM promotion_campaigns WHERE id = ${coupon.campaignId}::uuid FOR SHARE`
      campaign = await tx.promotionCampaign.findUnique({
        where: { id: coupon.campaignId },
      })
    }
    if (
      campaign &&
      (!['ACTIVE', 'SCHEDULED'].includes(campaign.status) ||
        !campaign.startsAt ||
        !campaign.endsAt ||
        now < campaign.startsAt ||
        now >= campaign.endsAt)
    )
      throw invalid()
    const counts = await this.usage(tx, coupon.id, customerId)
    if (
      (coupon.usageLimit !== null && counts.total >= coupon.usageLimit) ||
      (coupon.perCustomerLimit !== null &&
        counts.customer >= coupon.perCustomerLimit)
    )
      throw invalid()
    const discount = allocateDiscount(
      coupon.kind,
      coupon.value,
      coupon.maximumDiscountMinor,
      lines.map((line) => ({
        id: line.id,
        amountMinor:
          (line.variant?.priceMinor ?? line.product.priceMinor) * line.quantity,
        eligible:
          !coupon.categoryId ||
          line.product.categories.some(
            (category) => category.categoryId === coupon.categoryId,
          ),
      })),
    )
    if (discount.discountMinor < 1) throw invalid()
    return {
      couponId: coupon.id,
      couponCode: coupon.code,
      ...discount,
      snapshot: {
        id: coupon.id,
        code: coupon.code,
        revision: coupon.revision,
        kind: coupon.kind,
        value: coupon.value,
        currency: coupon.currency,
        categoryId: coupon.categoryId,
        campaignId: coupon.campaignId,
        campaignRevision: campaign?.revision ?? null,
        minimumSubtotalMinor: coupon.minimumSubtotalMinor,
        maximumDiscountMinor: coupon.maximumDiscountMinor,
        eligibleSubtotalMinor: discount.eligibleSubtotalMinor,
        startsAt: coupon.startsAt?.toISOString() ?? null,
        endsAt: coupon.endsAt?.toISOString() ?? null,
        stacking: false,
        taxBasis: 'DISCOUNTED_MERCHANDISE',
        shippingThresholdBasis: 'DISCOUNTED_MERCHANDISE',
      },
    }
  }
}
