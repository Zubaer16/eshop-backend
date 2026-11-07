import { createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import type { CheckoutRate } from '../src/generated/prisma/client'
import { Environment } from '../src/config/environment'
import { DatabaseService } from '../src/database/database.service'
import { PaymentsService } from '../src/payments/payments.service'
import { PaymentSettlementService } from '../src/payments/payment-settlement.service'
import { RefundLedgerService } from '../src/payments/refunds/refund-ledger.service'
import { RefundExecutionService } from '../src/payments/refunds/refund-execution.service'
import { StripeTestGateway } from '../src/payments/providers/stripe-gateway'
import { PromotionsFixture } from './promotions-test-support'
import { bearer, CatalogRole } from './catalog-test-support'
import { expect } from '@playwright/test'
const secret = 'whsec_REPORT_TESTONLY12345678901234567890'
const config = {
  get: (name: string) =>
    (
      ({
        STRIPE_TEST_ENABLED: true,
        STRIPE_TEST_REFUNDS_ENABLED: true,
        STRIPE_TEST_WEBHOOK_SECRET: secret,
        NODE_ENV: 'test',
      }) as Record<string, unknown>
    )[name],
} as unknown as ConfigService<Environment, true>
export const range = { from: '2001-01-01', to: '2001-01-03' }
export class ReportingFixture extends PromotionsFixture {
  readonly userIds: string[] = []
  readonly receiptIds: string[] = []
  private seq = 0
  private configured = false
  private readonly extraRates: {
    countryCode: string
    currency: string
    prior: CheckoutRate | null
  }[] = []
  override async account(role: CatalogRole) {
    const user = await super.account(role)
    this.userIds.push(user.id)
    return user
  }
  async order(
    owner: { id: string; token: string },
    currency = 'USD',
    priceMinor = 1000,
    couponCode?: string,
  ) {
    if (!this.configured) {
      await this.rate()
      this.configured = true
    }
    let countryCode = this.countryCode
    if (currency !== 'USD') {
      const found = this.extraRates.find((row) => row.currency === currency)
      if (found) countryCode = found.countryCode
      else {
        for (const code of [
          'TF',
          'GS',
          'HM',
          'PN',
          'NU',
          'TK',
          'WF',
          'NC',
          'PF',
        ])
          if (
            !(await this.db.deliveryZoneCountry.findUnique({
              where: { countryCode_currency: { countryCode: code, currency } },
            }))
          ) {
            countryCode = code
            break
          }
        const prior = await this.db.checkoutRate.findUnique({
          where: { countryCode_currency: { countryCode, currency } },
        })
        this.extraRates.push({ countryCode, currency, prior })
        await this.db.checkoutRate.upsert({
          where: { countryCode_currency: { countryCode, currency } },
          create: {
            countryCode,
            currency,
            shippingMinor: 0,
            taxBps: 0,
            enabled: true,
          },
          update: {
            shippingMinor: 0,
            taxBps: 0,
            freeOverSubtotalMinor: null,
            enabled: true,
          },
        })
      }
    }
    const n = this.seq++,
      customer = await this.account('CUSTOMER'),
      headers = bearer(owner.token)
    const category = await this.http.post('/v1/admin/categories', {
      headers,
      data: { name: 'reporting Category', slug: this.slug('report-cat-' + n) },
    })
    expect(category.status()).toBe(201)
    const product = await this.http.post('/v1/admin/products', {
      headers,
      data: {
        title: 'reporting Snapshot ' + n,
        slug: this.slug('report-product-' + n),
        sku: this.sku('report-' + n),
        currency,
        priceMinor,
        status: 'ACTIVE',
        stockOnHand: 20,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string,
      customerHeaders = bearer(customer.token)
    expect(
      (
        await this.http.put('/v1/cart/items', {
          headers: customerHeaders,
          data: { productId, quantity: 1 },
        })
      ).status(),
    ).toBe(200)
    const hold = await this.http.post('/v1/checkout/reservations', {
      headers: customerHeaders,
      data: {
        countryCode,
        requestId: randomUUID(),
        ...(couponCode ? { couponCode } : {}),
      },
    })
    expect(hold.status()).toBe(200)
    const response = await this.http.post('/v1/orders', {
      headers: customerHeaders,
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: {
          recipientName: 'reporting Customer',
          phone: '+12025550123',
          addressLine1: '9 Test Road',
          city: 'Testville',
          countryCode,
        },
      },
    })
    expect(response.status()).toBe(200)
    const order = (await response.json()) as {
      id: string
      totalMinor: number
      discountMinor: number
    }
    return { owner, customer, productId, currency, ...order }
  }
  async settle(order: {
    id: string
    totalMinor: number
    currency: string
    customer: { id: string }
  }) {
    const db = { client: this.db } as unknown as DatabaseService,
      intentId = 'pi_Report' + this.key + randomUUID().replaceAll('-', '')
    const gateway = {
      prepare: async () => ({
        id: intentId,
        status: 'requires_payment_method',
      }),
      retrieve: async () => ({
        id: intentId,
        status: 'succeeded',
        amountMinor: order.totalMinor,
        amountReceivedMinor: order.totalMinor,
        currency: order.currency,
        orderId: order.id,
        livemode: false,
      }),
    } as unknown as StripeTestGateway
    const payments = new PaymentsService(db, config, gateway)
    await payments.prepare(order.customer.id, order.id)
    const providerEventId = 'evt_Report' + randomUUID().replaceAll('-', ''),
      raw = Buffer.from(
        JSON.stringify({
          id: providerEventId,
          type: 'payment_intent.succeeded',
          livemode: false,
          data: { object: { object: 'payment_intent', id: intentId } },
        }),
      ),
      time = Math.floor(Date.now() / 1000),
      signature =
        't=' +
        time +
        ',v1=' +
        createHmac('sha256', secret)
          .update(time + '.')
          .update(raw)
          .digest('hex')
    await payments.receiveWebhook(raw, signature)
    const receipt = await this.db.paymentWebhookReceipt.findUniqueOrThrow({
      where: { providerEventId },
    })
    this.receiptIds.push(receipt.id)
    expect(
      await new PaymentSettlementService(db, config, gateway).reconcileReceipt(
        receipt.id,
      ),
    ).toBe('SETTLED')
    const stamp = new Date('2001-01-01T12:00:00Z')
    await this.db.order.update({
      where: { id: order.id },
      data: { createdAt: stamp, paidAt: stamp },
    })
    await this.db.paymentTransaction.update({
      where: { orderId: order.id },
      data: { createdAt: stamp },
    })
    await this.db.paymentAttempt.update({
      where: { orderId: order.id },
      data: { createdAt: stamp },
    })
    return this.db.paymentTransaction.findUniqueOrThrow({
      where: { orderId: order.id },
    })
  }
  async refund(
    ownerId: string,
    orderId: string,
    amountMinor: number,
    status = 'succeeded',
  ) {
    const db = { client: this.db } as unknown as DatabaseService,
      record = await new RefundLedgerService(db).create(ownerId, orderId, {
        requestId: randomUUID(),
        amountMinor,
        reason: 'OTHER',
      }),
      transaction = await this.db.paymentTransaction.findUniqueOrThrow({
        where: { orderId },
      }),
      providerId = 're_Report' + randomUUID().replaceAll('-', '')
    const value = {
      id: providerId,
      status,
      amountMinor,
      currency: transaction.currency,
      paymentIntentId: transaction.providerIntentId,
      orderId,
      refundRequestId: record.id,
      livemode: false,
    }
    const gateway = {
      createRefund: async () => ({ ...value, status: 'pending' }),
      retrieveRefund: async () => value,
    } as unknown as StripeTestGateway
    const outcome = await new RefundExecutionService(
      db,
      config,
      gateway,
    ).process(record.id)
    expect(outcome).toBe(status === 'succeeded' ? 'SUCCEEDED' : 'FAILED')
    await this.db.refundRequest.update({
      where: { id: record.id },
      data: { confirmedAt: new Date('2001-01-02T12:00:00Z') },
    })
    return record
  }
  override async close() {
    try {
      await this.db.paymentWebhookReceipt.deleteMany({
        where: { id: { in: this.receiptIds } },
      })
      for (const entry of this.extraRates)
        if (entry.prior)
          await this.db.checkoutRate.upsert({
            where: {
              countryCode_currency: {
                countryCode: entry.countryCode,
                currency: entry.currency,
              },
            },
            create: entry.prior,
            update: entry.prior,
          })
        else
          await this.db.checkoutRate.deleteMany({
            where: { countryCode: entry.countryCode, currency: entry.currency },
          })
    } finally {
      await super.close()
    }
  }
}
export { expect, bearer }
