import { resolveCheckoutRate } from './checkout-rates'
import { ConflictException, Injectable } from '@nestjs/common'
import { PromotionsService } from '../promotions/promotions.service'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { loadCheckoutItems } from './checkout-items'
import { calculateCartQuote } from './cart.quote'
import {
  CheckoutEstimateDto,
  PutCheckoutRateDto,
  PutCheckoutDefaultRateDto,
} from './checkout.dto'
import { estimateConfiguredCharges } from './checkout.pricing'
import { DeliveryZonesService } from './delivery-zones.service'
import type { AvailableDeliveryOptionsDto } from './delivery-zones.dto'

@Injectable()
export class CheckoutService {
  constructor(
    private readonly database: DatabaseService,
    private readonly zones: DeliveryZonesService,
    private readonly promotions: PromotionsService,
  ) {}

  /** Read-only reprice: no inventory hold, no order or payment, and no payable amount promised. */
  async estimate(customerId: string, input: CheckoutEstimateDto) {
    return this.database.client.$transaction(
      async (tx) => {
        const items = await loadCheckoutItems(tx, input.items, false)
        const quote = calculateCartQuote(null, items, false)
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
        )
        const charges = estimateConfiguredCharges(
          quote.subtotalMinor,
          delivery.shippingMinor,
          delivery.freeOverSubtotalMinor,
          discount.discountMinor,
        )
        return {
          countryCode: input.countryCode,
          currency: quote.currency,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: discount.discountMinor,
          couponCode: discount.couponCode,
          couponSnapshot: discount.snapshot,
          ...charges,
          deliveryKind: delivery.deliveryKind?.toLowerCase() ?? null,
          deliveryZoneName: delivery.zoneName,
          deliveryEtaNote: delivery.etaNote,
          quotedAt: quote.quotedAt,
          reservationStatus: 'NOT_RESERVED' as const,
          payable: false as const,
          notice:
            'Estimate only. Stock and final prices are confirmed before payment.',
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  /** Customer JWT only: quote server-defined delivery options for the live cart.
   * Delivery defaults are resolved for the submitted cart currency.
   */
  async deliveryOptions(
    customerId: string,
    input: CheckoutEstimateDto,
  ): Promise<AvailableDeliveryOptionsDto> {
    const { countryCode, couponCode } = input
    return this.database.client.$transaction(
      async (tx) => {
        const items = await loadCheckoutItems(tx, input.items, false)
        const quote = calculateCartQuote(null, items, false)
        if (!quote.checkoutReady || !quote.currency)
          throw new ConflictException('Cart is not checkout-ready')
        const currency = quote.currency
        const rate = await resolveCheckoutRate(tx, countryCode, currency)
        const discount = await this.promotions.quote(
          tx,
          customerId,
          currency,
          quote.subtotalMinor,
          items,
          couponCode,
        )
        const available = await this.zones.options(
          tx,
          countryCode,
          currency,
          rate,
        )
        return {
          countryCode,
          currency,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: discount.discountMinor,
          couponCode: discount.couponCode,
          options: available.map((option) => {
            const price = estimateConfiguredCharges(
              quote.subtotalMinor,
              option.shippingMinor,
              option.freeOverSubtotalMinor,
              discount.discountMinor,
            )
            return {
              kind: option.deliveryKind
                ? option.deliveryKind === 'STANDARD'
                  ? 'standard'
                  : 'express'
                : null,
              label: option.deliveryKind
                ? option.deliveryKind === 'STANDARD'
                  ? 'Standard'
                  : 'Express'
                : 'Standard delivery',
              shippingMinor: price.shippingMinor,
              taxMinor: price.taxMinor,
              totalMinor: price.estimatedTotalMinor,
              etaNote: option.etaNote,
            }
          }),
          guestCheckoutEnabled: false,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  listDefaults() {
    return this.database.client.checkoutDefaultRate.findMany({
      orderBy: { currency: 'asc' },
    })
  }

  async putDefault(input: PutCheckoutDefaultRateDto, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const data = {
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
        }
        if (input.expectedRevision === 0) {
          await tx.checkoutDefaultRate.create({
            data: { currency: input.currency, ...data },
          })
        } else {
          const updated = await tx.checkoutDefaultRate.updateMany({
            where: {
              currency: input.currency,
              revision: input.expectedRevision,
            },
            data: { ...data, revision: { increment: 1 } },
          })
          if (updated.count !== 1)
            throw new ConflictException(
              'Default shipping policy changed. Reload its current revision.',
            )
        }
        const rate = await tx.checkoutDefaultRate.findUniqueOrThrow({
          where: { currency: input.currency },
        })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'checkout.defaults.updated',
            targetType: 'checkout_default_rate',
            targetId: rate.currency,
          },
        })
        return rate
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Default shipping policy already exists. Reload its current revision.',
        )
      throw error
    }
  }

  /** OWNER-managed country delivery overrides. */
  listRates() {
    return this.database.client.checkoutRate.findMany({
      orderBy: [{ countryCode: 'asc' }, { currency: 'asc' }],
    })
  }

  async putRate(input: PutCheckoutRateDto, actorId: string) {
    return this.database.client.$transaction(async (tx) => {
      const rate = await tx.checkoutRate.upsert({
        where: {
          countryCode_currency: {
            countryCode: input.countryCode,
            currency: input.currency,
          },
        },
        create: {
          countryCode: input.countryCode,
          currency: input.currency,
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
          enabled: input.enabled,
        },
        update: {
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
          enabled: input.enabled,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'checkout.rate.upserted',
          targetType: 'checkout_rate',
          targetId: rate.id,
        },
      })
      return rate
    })
  }
}
