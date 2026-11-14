import { createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { DatabaseService } from '../src/database/database.service'
import { ReservationService } from '../src/checkout/reservation.service'
import { DeliveryZonesService } from '../src/checkout/delivery-zones.service'
import { PromotionsService } from '../src/promotions/promotions.service'
import { OrdersService } from '../src/orders/orders.service'
import { HostedCheckoutService } from '../src/payments/hosted-checkout.service'
import {
  StripeCheckoutGateway,
  type HostedSession,
} from '../src/payments/providers/stripe-checkout-gateway'
import { PaymentSettlementService } from '../src/payments/payment-settlement.service'
import { PaymentsService } from '../src/payments/payments.service'
import { StripeTestGateway } from '../src/payments/providers/stripe-gateway'
import type { Environment } from '../src/config/environment'

test('hosted checkout isolated DB: final shortages, exclusive holds, uncertain replay, cancellation, failure, expiry and signed settlement', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const db = { client: f.db } as unknown as DatabaseService
  const countryCode = 'CK',
    currency = 'USD',
    origin = 'https://store.example.test'
  const secret = 'whsec_HostedCheckoutFakeSecret123456'
  const config = {
    get: (key: string) =>
      ({
        STRIPE_TEST_ENABLED: true,
        STRIPE_TEST_CHECKOUT_ENABLED: true,
        NODE_ENV: 'test',
        CORS_ORIGINS: origin,
        STRIPE_TEST_WEBHOOK_SECRET: secret,
      })[key],
  } as unknown as ConfigService<Environment, true>
  const reservations = new ReservationService(
    db,
    new DeliveryZonesService(db),
    new PromotionsService(db),
  )
  const orders = new OrdersService(db)
  const sessions = new Map<string, HostedSession>()
  let loseResponse = false,
    creates = 0
  const gateway = {
    create: async (input: {
      orderId: string
      key: string
      amountMinor: number
      currency: string
      expiresAt: Date
    }) => {
      creates++
      let session = sessions.get(input.orderId)
      if (!session) {
        session = {
          id: 'cs_test_' + f.key + String(sessions.size).padStart(8, '0'),
          orderId: input.orderId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: 'open',
          paymentStatus: 'unpaid',
          paymentIntentId: null,
          paymentFailed: false,
          expiresAt: input.expiresAt,
          url: 'https://checkout.stripe.com/c/pay/test_' + input.orderId,
        }
        sessions.set(input.orderId, session)
      }
      if (loseResponse) {
        loseResponse = false
        throw new ServiceUnavailableException(
          'Response lost after provider creation',
        )
      }
      return session
    },
    retrieve: async (id: string) =>
      [...sessions.values()].find((row) => row.id === id)!,
    expire: async (id: string) => {
      const session = [...sessions.values()].find((row) => row.id === id)!
      if (session.status === 'complete')
        throw new ServiceUnavailableException(
          'Payment won the cancellation race',
        )
      session.status = 'expired'
      session.url = null
      return session
    },
  } as unknown as StripeCheckoutGateway
  const checkout = new HostedCheckoutService(
    db,
    config,
    reservations,
    orders,
    gateway,
  )
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  const eventId = 'evt_Hosted' + f.key + '12345678'
  const customerIds: string[] = []
  try {
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER'),
      other = await f.account('CUSTOMER')
    customerIds.push(customer.id, other.id)
    const category = await (
      await request.post('/v1/admin/categories', {
        headers: bearer(owner.token),
        data: { name: 'Hosted checkout', slug: f.slug('hosted-cat') },
      })
    ).json()
    const product = await (
      await request.post('/v1/admin/products', {
        headers: bearer(owner.token),
        data: {
          title: 'Checkout inventory',
          slug: f.slug('hosted'),
          sku: f.sku('hosted'),
          status: 'ACTIVE',
          currency,
          priceMinor: 500,
          stockOnHand: 10,
          categoryIds: [category.id],
        },
      })
    ).json()
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 50,

        enabled: true,
      },
      update: {
        shippingMinor: 50,

        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    const address = {
      recipientName: 'Checkout Customer',
      phone: '+12025550123',
      addressLine1: '1 Checkout Road',
      city: 'Example',
      countryCode,
    }
    const input = (token = customer.token) => ({
      requestId: randomUUID(),
      countryCode,
      shippingAddress: address,
      items: f.selections(bearer(token)),
    })
    const quantity = async (customerToken: string, value: number) => {
      f.selectItems(bearer(customerToken), {
        productId: product.id,
        quantity: value,
      })
    }
    const balance = () =>
      f.db.inventoryBalance.findUniqueOrThrow({
        where: { productId: product.id },
      })
    await quantity(customer.token, 12)
    const rejected = await checkout
      .start(customer.id, input(), origin)
      .catch((error: unknown) => error)
    expect(rejected).toBeInstanceOf(ConflictException)
    expect((rejected as ConflictException).getResponse()).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      items: [{ requestedQuantity: 12, availableQuantity: 10 }],
    })
    expect(creates).toBe(0)
    expect((await balance()).reservedQuantity).toBe(0)
    await quantity(customer.token, 10)
    await quantity(other.token, 1)
    // Both customers reach the final boundary together. Only one can reserve.
    const competing = await Promise.allSettled([
      checkout.start(customer.id, input(), origin),
      checkout.start(other.id, input(other.token), origin),
    ])
    expect(competing.filter((row) => row.status === 'fulfilled')).toHaveLength(
      1,
    )
    const winner = competing.find((row) => row.status === 'fulfilled')!
    expect(winner.status).toBe('fulfilled')
    const winnerOrder = await f.db.order.findUniqueOrThrow({
      where: {
        id: (winner as PromiseFulfilledResult<{ orderId: string }>).value
          .orderId,
      },
    })
    expect((await balance()).onHand).toBe(10)
    await checkout.cancel(winnerOrder.customerId, winnerOrder.id)
    expect((await balance()).reservedQuantity).toBe(0)

    await quantity(customer.token, 2)
    const stable = input()
    loseResponse = true
    await expect(checkout.start(customer.id, stable, origin)).rejects.toThrow(
      'Response lost',
    )
    expect((await balance()).reservedQuantity).toBe(2)
    const replay = await checkout.start(customer.id, stable, origin)
    const duplicate = await checkout.start(customer.id, stable, origin)
    expect(duplicate.sessionId).toBe(replay.sessionId)
    expect((await balance()).reservedQuantity).toBe(2)
    await expect(
      checkout.start(
        customer.id,
        { ...stable, shippingAddress: { ...address, city: 'Changed' } },
        origin,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      checkout.resume(other.id, replay.orderId, origin),
    ).rejects.toThrow('Order not found')
    await expect(orders.cancel(customer.id, replay.orderId)).rejects.toThrow(
      'in progress',
    )

    const session = sessions.get(replay.orderId)!
    session.status = 'complete'
    session.paymentStatus = 'paid'
    session.paymentIntentId = 'pi_Hosted' + f.key + '12345678'
    await checkout.cancel(customer.id, replay.orderId)
    expect((await balance()).reservedQuantity).toBe(2)
    expect((await orders.get(customer.id, replay.orderId)).status).toBe(
      'PENDING_PAYMENT',
    )
    const payments = new PaymentsService(db, config, {} as StripeTestGateway)
    const payload = Buffer.from(
      JSON.stringify({
        id: eventId,
        type: 'payment_intent.succeeded',
        livemode: false,
        data: {
          object: { object: 'payment_intent', id: session.paymentIntentId },
        },
      }),
    )
    const timestamp = Math.floor(Date.now() / 1000)
    const signature =
      't=' +
      timestamp +
      ',v1=' +
      createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(payload)
        .digest('hex')
    await payments.receiveWebhook(payload, signature)
    const intentGateway = {
      retrieve: async () => ({
        id: session.paymentIntentId!,
        orderId: replay.orderId,
        status: 'succeeded',
        amountMinor: session.amountMinor,
        amountReceivedMinor: session.amountMinor,
        currency,
        livemode: false,
      }),
    } as unknown as StripeTestGateway
    const settlement = new PaymentSettlementService(
      db,
      config,
      intentGateway,
      checkout,
    )
    await settlement.reconcileOrder(customer.id, replay.orderId)
    await settlement.reconcileOrder(customer.id, replay.orderId)
    expect((await orders.get(customer.id, replay.orderId)).status).toBe('PAID')
    expect((await balance()).onHand).toBe(8)
    expect((await balance()).reservedQuantity).toBe(0)
    expect(
      await f.db.paymentTransaction.count({
        where: { orderId: replay.orderId },
      }),
    ).toBe(1)

    const failed = await checkout.start(customer.id, input(), origin)
    sessions.get(failed.orderId)!.paymentFailed = true
    await checkout.syncBatch()
    expect((await orders.get(customer.id, failed.orderId)).status).toBe(
      'CANCELLED',
    )
    expect((await balance()).reservedQuantity).toBe(0)
    const expired = await checkout.start(customer.id, input(), origin)
    const deadline = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000)
    sessions.get(expired.orderId)!.expiresAt = deadline
    await f.db.paymentAttempt.update({
      where: { orderId: expired.orderId },
      data: { checkoutExpiresAt: deadline },
    })
    await checkout.syncBatch()
    expect((await orders.get(customer.id, expired.orderId)).status).toBe(
      'CANCELLED',
    )
    expect((await balance()).onHand).toBe(8)
    expect((await balance()).reservedQuantity).toBe(0)

    // An old ambiguous create must retain stock until its provider session is
    // identified. Generic order cancellation and expiry cannot bypass it.
    loseResponse = true
    const oldInput = input()
    await expect(checkout.start(customer.id, oldInput, origin)).rejects.toThrow(
      'Response lost',
    )
    const oldOrder = await f.db.order.findUniqueOrThrow({
      where: {
        customerId_requestId: {
          customerId: customer.id,
          requestId: oldInput.requestId,
        },
      },
    })
    const oldAttempt = await f.db.paymentAttempt.update({
      where: { orderId: oldOrder.id },
      data: { createdAt: new Date(Date.now() - 23 * 60 * 60000) },
    })
    await f.db.order.update({
      where: { id: oldOrder.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 1000) },
    })
    await checkout.syncBatch()
    expect(
      (
        await f.db.paymentAttempt.findUniqueOrThrow({
          where: { id: oldAttempt.id },
        })
      ).status,
    ).toBe('REQUIRES_REVIEW')
    await expect(orders.cancel(customer.id, oldOrder.id)).rejects.toThrow(
      'in progress',
    )
    await orders.expireBatch()
    expect((await orders.get(customer.id, oldOrder.id)).status).toBe(
      'PENDING_PAYMENT',
    )
    expect((await balance()).reservedQuantity).toBe(2)
    // The fake provider identifies the original session for fixture cleanup.
    await f.db.paymentAttempt.update({
      where: { id: oldAttempt.id },
      data: {
        checkoutSessionId: sessions.get(oldOrder.id)!.id,
        status: 'AWAITING_WEBHOOK',
      },
    })
    await checkout.cancel(customer.id, oldOrder.id)
    expect((await balance()).reservedQuantity).toBe(0)
  } finally {
    const pending = await f.db.order.findMany({
      where: { customerId: { in: customerIds }, status: 'PENDING_PAYMENT' },
    })
    for (const order of pending)
      await checkout.cancel(order.customerId, order.id)
    await f.db.paymentWebhookReceipt.deleteMany({
      where: { providerEventId: eventId },
    })
    if (prior)
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: prior,
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
