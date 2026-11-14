import { resolveCheckoutRate } from './checkout-rates'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PromotionsService } from '../promotions/promotions.service'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { loadCheckoutItems, reservationFingerprint } from './checkout-items'
import { calculateCartQuote } from './cart.quote'
import { estimateConfiguredCharges } from './checkout.pricing'
import { CreateReservationDto } from './reservation.dto'
import { DeliveryZonesService } from './delivery-zones.service'

// A bounded hold; a scheduled checkout:expire run is required in deployment.
export const RESERVATION_TTL_MS = 10 * 60 * 1000
const includeLines = {
  lines: { orderBy: { balanceId: 'asc' as const } },
} satisfies Prisma.CheckoutReservationInclude

type Hold = Prisma.CheckoutReservationGetPayload<{
  include: typeof includeLines
}>

function present(hold: Hold) {
  return {
    id: hold.id,
    requestId: hold.requestId,
    status: hold.status,
    countryCode: hold.countryCode,
    currency: hold.currency,
    subtotalMinor: hold.subtotalMinor,
    discountMinor: hold.discountMinor,
    couponCode: hold.couponCode,
    couponSnapshot: hold.couponSnapshot,
    shippingMinor: hold.shippingMinor,
    deliveryKind: hold.deliveryKind?.toLowerCase() ?? null,
    taxMinor: hold.taxMinor,
    estimatedTotalMinor: hold.estimatedTotalMinor,
    expiresAt: hold.expiresAt,
    items: hold.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
    })),
    payable: false as const,
  }
}

@Injectable()
export class ReservationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly zones: DeliveryZonesService,
    private readonly promotions: PromotionsService,
  ) {}

  /** Must run within one DB transaction. Locks reservation row before balances. */
  private async transition(
    tx: Prisma.TransactionClient,
    id: string,
    action: 'RELEASED' | 'EXPIRED',
  ) {
    await tx.$queryRaw`SELECT id FROM checkout_reservations WHERE id = ${id}::uuid FOR UPDATE`
    const record = await tx.checkoutReservation.findUnique({
      where: { id },
      include: includeLines,
    })
    if (!record) throw new NotFoundException('Checkout reservation not found')
    if (record.status !== 'ACTIVE') return record
    for (const line of [...record.lines].sort((a, b) =>
      a.balanceId.localeCompare(b.balanceId),
    )) {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE inventory_balances
        SET reserved_quantity = reserved_quantity - ${line.quantity}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id = ${line.balanceId}::uuid AND reserved_quantity >= ${line.quantity}
        RETURNING id
      `
      if (updated.length !== 1)
        throw new ConflictException(
          'Reservation balance integrity check failed',
        )
    }
    return tx.checkoutReservation.update({
      where: { id },
      data: { status: action, releasedAt: new Date() },
      include: includeLines,
    })
  }

  async reserve(customerId: string, input: CreateReservationDto) {
    const requestHash = reservationFingerprint(input)
    const key = {
      customerId_requestId: { customerId, requestId: input.requestId },
    }
    const seen = await this.database.client.checkoutReservation.findUnique({
      where: key,
      include: includeLines,
    })
    if (seen) {
      if (seen.requestHash !== requestHash)
        throw new ConflictException(
          'Checkout request UUID reused with different details',
        )
      return this.get(customerId, seen.id)
    }
    try {
      return await this.database.client.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${customerId}::uuid FOR UPDATE`
          const replay = await tx.checkoutReservation.findUnique({
            where: key,
            include: includeLines,
          })
          if (replay) {
            if (replay.requestHash !== requestHash)
              throw new ConflictException(
                'Checkout request UUID reused with different details',
              )
            return present(
              replay.status === 'ACTIVE' && replay.expiresAt <= new Date()
                ? await this.transition(tx, replay.id, 'EXPIRED')
                : replay,
            )
          }
          const active = await tx.checkoutReservation.findFirst({
            where: { customerId, status: 'ACTIVE' },
            select: { id: true, expiresAt: true },
          })
          if (active) {
            if (active.expiresAt > new Date())
              throw new ConflictException(
                'Release the existing active reservation before reserving again',
              )
            await this.transition(tx, active.id, 'EXPIRED')
          }
          let items = await loadCheckoutItems(tx, input.items, true)
          const balanceIds = [
            ...new Set(
              items.flatMap((line) => {
                const balance = line.product.hasVariants
                  ? line.variant?.inventoryBalance
                  : line.product.inventoryBalance
                return balance ? [balance.id] : []
              }),
            ),
          ].sort()
          for (const balanceId of balanceIds) {
            await tx.$queryRaw`SELECT id FROM inventory_balances WHERE id = ${balanceId}::uuid FOR UPDATE`
          }
          // Read again after acquiring every balance lock so conflict quantities
          // include other customers' reservations committed while we waited.
          items = await loadCheckoutItems(tx, input.items, true)
          const quote = calculateCartQuote(null, items)
          const shortages = quote.items
            .filter((line) => line.status === 'OUT_OF_STOCK')
            .map((line) => ({
              itemId: line.id,
              productId: line.productId,
              variantId: line.variantId,
              title: line.title,
              sku: line.sku,
              requestedQuantity: line.quantity,
              availableQuantity: line.availableQuantity,
            }))
          if (shortages.length)
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message:
                'Some items have less stock than requested. Update their quantities or remove them.',
              items: shortages,
            })
          if (!quote.checkoutReady || !quote.currency)
            throw new ConflictException({
              message: 'Cart is not checkout-ready',
              issues: quote.issues,
            })
          const rate = await resolveCheckoutRate(
            tx,
            input.countryCode,
            quote.currency,
          )
          const delivery = await this.zones.resolve(
            tx,
            input.countryCode,
            quote.currency,
            input.deliveryKind,
            rate,
          )
          const discount = await this.promotions.quote(
            tx,
            customerId,
            quote.currency,
            quote.subtotalMinor,
            items,
            input.couponCode,
            true,
          )
          const charges = estimateConfiguredCharges(
            quote.subtotalMinor,
            delivery.shippingMinor,
            delivery.freeOverSubtotalMinor,
            discount.discountMinor,
          )
          if (discount.couponId && charges.estimatedTotalMinor === 0)
            throw new UnprocessableEntityException(
              'Zero-total coupon checkout is not supported',
            )
          const lines = items
            .map((line) => {
              const balanceId = line.product.hasVariants
                ? line.variant?.inventoryBalance?.id
                : line.product.inventoryBalance?.id
              if (!balanceId)
                throw new ConflictException('Inventory balance unavailable')
              const price = line.variant?.priceMinor ?? line.product.priceMinor
              return {
                balanceId,
                productId: line.productId,
                variantId: line.variantId,
                quantity: line.quantity,
                unitPriceMinor: price,
                discountMinor: discount.lineDiscounts[line.id] ?? 0,
              }
            })
            .sort((a, b) => a.balanceId.localeCompare(b.balanceId))
          // Guarded atomic updates form a single transaction. No oversell or partial hold.
          for (const line of lines) {
            const changed = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE inventory_balances
            SET reserved_quantity = reserved_quantity + ${line.quantity}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            WHERE id = ${line.balanceId}::uuid
              AND on_hand - reserved_quantity >= ${line.quantity}
            RETURNING id
          `
            if (changed.length !== 1)
              throw new ConflictException(
                'Insufficient available stock for reservation',
              )
          }
          const saved = await tx.checkoutReservation.create({
            data: {
              customerId,
              requestHash,
              requestId: input.requestId,
              countryCode: input.countryCode,
              currency: quote.currency,
              subtotalMinor: quote.subtotalMinor,
              discountMinor: discount.discountMinor,
              couponCode: discount.couponCode,
              ...(discount.snapshot
                ? { couponSnapshot: discount.snapshot }
                : {}),
              shippingMinor: charges.shippingMinor,
              deliveryKind: delivery.deliveryKind,
              taxMinor: charges.taxMinor,
              estimatedTotalMinor: charges.estimatedTotalMinor,
              expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
              lines: { create: lines },
            },
            include: includeLines,
          })
          if (discount.couponId)
            await tx.couponRedemption.create({
              data: {
                couponId: discount.couponId,
                reservationId: saved.id,
                customerId,
                discountMinor: discount.discountMinor,
              },
            })
          return present(saved)
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      )
    } catch (error) {
      // Concurrent identical UUID requests: the unique loser can return the winner.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner =
          await this.database.client.checkoutReservation.findUnique({
            where: key,
            include: includeLines,
          })
        if (winner && winner.requestHash === requestHash) return present(winner)
      }
      throw error
    }
  }

  /** Owned discovery after a lost response. No address or provider credentials. */
  async recovery(customerId: string) {
    const active = await this.database.client.checkoutReservation.findFirst({
      where: { customerId, status: 'ACTIVE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    })
    const reservation = active ? await this.get(customerId, active.id) : null
    const order = await this.database.client.order.findFirst({
      where: { customerId, status: 'PENDING_PAYMENT' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    })
    return { reservation, orderId: order?.id ?? null }
  }

  async get(customerId: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      const found = await tx.checkoutReservation.findFirst({
        where: { id, customerId },
        select: { id: true },
      })
      if (!found) throw new NotFoundException('Checkout reservation not found')
      const locked = await tx.checkoutReservation.findUniqueOrThrow({
        where: { id },
        include: includeLines,
      })
      const result =
        locked.status === 'ACTIVE' && locked.expiresAt <= new Date()
          ? await this.transition(tx, id, 'EXPIRED')
          : locked
      return present(result)
    })
  }

  async release(customerId: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      const found = await tx.checkoutReservation.findFirst({
        where: { id, customerId },
        select: { id: true },
      })
      if (!found) throw new NotFoundException('Checkout reservation not found')
      const locked = await tx.checkoutReservation.findUniqueOrThrow({
        where: { id },
        include: includeLines,
      })
      const result =
        locked.status === 'ACTIVE'
          ? await this.transition(
              tx,
              id,
              locked.expiresAt <= new Date() ? 'EXPIRED' : 'RELEASED',
            )
          : locked
      return present(result)
    })
  }

  /** Safe for concurrent schedulers: SKIP LOCKED, idempotent release. */
  async expireBatch(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ConflictException('Invalid expiry batch size')
    return this.database.client.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM checkout_reservations
        WHERE status = 'ACTIVE' AND expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        ORDER BY expires_at ASC, id ASC
        LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `
        for (const row of ids) await this.transition(tx, row.id, 'EXPIRED')
        return { expired: ids.length }
      },
      { timeout: 30000 },
    )
  }
}
