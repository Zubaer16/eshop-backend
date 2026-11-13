import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PromotionsService } from '../promotions/promotions.service'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { draftQuoteIncludes } from '../cart/cart.service'
import { calculateCartQuote } from '../cart/cart.quote'
import { CheckoutEstimateDto, PutCheckoutRateDto } from './checkout.dto'
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
        const cart = await tx.cart.findUnique({
          where: { userId: customerId },
          include: draftQuoteIncludes,
        })
        const quote = calculateCartQuote(
          cart?.id ?? null,
          cart?.items ?? [],
          false,
        )
        if (!quote.checkoutReady || !quote.cartId || !quote.currency)
          throw new ConflictException({
            message: 'Cart is not checkout-ready',
            issues: quote.issues,
          })
        const rate = await tx.checkoutRate.findUnique({
          where: {
            countryCode_currency: {
              countryCode: input.countryCode,
              currency: quote.currency,
            },
          },
        })
        if (!rate || !rate.enabled)
          throw new UnprocessableEntityException(
            'No enabled shipping/tax policy for this country and cart currency',
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
          cart!.items,
          input.couponCode,
        )
        const charges = estimateConfiguredCharges(
          quote.subtotalMinor,
          delivery.shippingMinor,
          delivery.freeOverSubtotalMinor,
          rate.taxBps,
          discount.discountMinor,
        )
        return {
          cartId: quote.cartId,
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
          appliedTaxBps: rate.taxBps,
          quotedAt: quote.quotedAt,
          reservationStatus: 'NOT_RESERVED' as const,
          payable: false as const,
          notice:
            'Estimate only. No stock reserved, order created or payment authorized. Verify jurisdiction-specific tax and address rules before checkout.',
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  /** Customer JWT only: quote server-defined delivery options for the live cart.
   * A disabled/unconfigured tax lane fails closed; no guest checkout.
   */
  async deliveryOptions(
    customerId: string,
    countryCode: string,
    couponCode?: string,
  ): Promise<AvailableDeliveryOptionsDto> {
    return this.database.client.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId: customerId },
          include: draftQuoteIncludes,
        })
        const quote = calculateCartQuote(
          cart?.id ?? null,
          cart?.items ?? [],
          false,
        )
        if (!quote.checkoutReady || !quote.currency)
          throw new ConflictException('Cart is not checkout-ready')
        const currency = quote.currency
        const rate = await tx.checkoutRate.findUnique({
          where: { countryCode_currency: { countryCode, currency } },
        })
        if (!rate?.enabled)
          throw new UnprocessableEntityException(
            'No enabled shipping/tax policy for this destination',
          )
        const discount = await this.promotions.quote(
          tx,
          customerId,
          currency,
          quote.subtotalMinor,
          cart!.items,
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
              rate.taxBps,
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
                : 'Legacy flat rate',
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

  /** OWNER-only explicit lane configuration; no implicit fallbacks between countries/currencies. */
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
          taxBps: input.taxBps,
          enabled: input.enabled,
        },
        update: {
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
          taxBps: input.taxBps,
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
