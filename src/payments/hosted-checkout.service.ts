import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import { ReservationService } from '../checkout/reservation.service'
import { OrdersService } from '../orders/orders.service'
import type { PaymentAttempt } from '../generated/prisma/client'
import { stripeTestCapabilityEnabled } from './stripe-demo-policy'
import {
  CheckoutCreationRejected,
  StripeCheckoutGateway,
  type HostedSession,
} from './providers/stripe-checkout-gateway'
import { StartHostedCheckoutDto } from './hosted-checkout.dto'

const SESSION_WINDOW_MS = 31 * 60_000
const RECONCILIATION_WINDOW_MS = 10 * 60_000
const KEY_PREFIX = 'hosted-checkout-'

@Injectable()
export class HostedCheckoutService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly reservations: ReservationService,
    private readonly orders: OrdersService,
    private readonly stripe: StripeCheckoutGateway,
  ) {}

  private origin(value: string | undefined) {
    const allowed = this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
    if (!value || !allowed.includes(value))
      throw new BadRequestException(
        'Checkout requires an allowed storefront origin',
      )
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' &&
        !(
          this.config.get('NODE_ENV', { infer: true }) !== 'production' &&
          url.protocol === 'http:'
        )) ||
      url.origin !== value
    )
      throw new BadRequestException('Invalid checkout return origin')
    return value
  }
  private enabled() {
    if (!stripeTestCapabilityEnabled(this.config, 'checkout'))
      throw new ServiceUnavailableException('Stripe Checkout is not configured')
  }

  async start(
    customerId: string,
    input: StartHostedCheckoutDto,
    returnOrigin?: string,
  ) {
    this.enabled()
    const origin = this.origin(returnOrigin)
    if (input.countryCode !== input.shippingAddress.countryCode)
      throw new BadRequestException(
        'Delivery country must match the selected address',
      )
    if (
      !input.shippingAddress.recipientName.trim() ||
      input.shippingAddress.addressLine1.trim().length < 3 ||
      !input.shippingAddress.city.trim()
    )
      throw new BadRequestException('Enter a complete delivery address')
    const reservation = await this.reservations.reserve(customerId, input)
    const order = await this.orders.create(customerId, {
      requestId: input.requestId,
      reservationId: reservation.id,
      shippingAddress: input.shippingAddress,
    })
    return this.resume(customerId, order.id, origin)
  }

  async resume(customerId: string, orderId: string, returnOrigin?: string) {
    this.enabled()
    const origin = this.origin(returnOrigin)
    const attempt = await this.db.client.$transaction(async (tx) => {
      const own = await tx.order.findFirst({
        where: { id: orderId, customerId },
        select: { id: true },
      })
      if (!own) throw new NotFoundException('Order not found')
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
      if (order.status !== 'PENDING_PAYMENT')
        throw new ConflictException('This order is no longer awaiting payment')
      const existing = await tx.paymentAttempt.findUnique({
        where: { orderId },
      })
      if (existing) {
        if (
          existing.idempotencyKey !== KEY_PREFIX + orderId ||
          existing.checkoutReturnOrigin !== origin
        )
          throw new ConflictException(
            'This order already has a different payment preparation',
          )
        if (
          ['CANCELLED', 'SETTLED', 'REQUIRES_REVIEW'].includes(existing.status)
        )
          throw new ConflictException(
            'Refresh the order payment status before continuing',
          )
        return existing
      }
      if (order.paymentDeadlineAt <= new Date())
        throw new ConflictException('The payment window has expired')
      const expiresAt = new Date(
        Math.floor((Date.now() + SESSION_WINDOW_MS) / 1000) * 1000,
      )
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentDeadlineAt: new Date(
            expiresAt.getTime() + RECONCILIATION_WINDOW_MS,
          ),
        },
      })
      // This state fences every existing order cancellation/expiry path while a
      // hosted session could accept payment, including an ambiguous create call.
      return tx.paymentAttempt.create({
        data: {
          orderId,
          idempotencyKey: KEY_PREFIX + orderId,
          amountMinor: order.totalMinor,
          currency: order.currency,
          status: 'AWAITING_WEBHOOK',
          checkoutReturnOrigin: origin,
          checkoutExpiresAt: expiresAt,
        },
      })
    })
    const session = await this.session(attempt)
    this.verify(attempt, session)
    if (
      session.status !== 'open' ||
      session.paymentFailed ||
      !session.url ||
      session.expiresAt <= new Date()
    ) {
      await this.sync(attempt.id)
      throw new ConflictException(
        'Checkout has finished or expired. Refresh the order status.',
      )
    }
    return {
      orderId,
      sessionId: session.id,
      url: session.url,
      expiresAt: session.expiresAt,
    }
  }

  private verify(attempt: PaymentAttempt, session: HostedSession) {
    if (
      session.orderId !== attempt.orderId ||
      session.amountMinor !== attempt.amountMinor ||
      session.currency !== attempt.currency ||
      (attempt.checkoutSessionId && session.id !== attempt.checkoutSessionId) ||
      (attempt.providerIntentId &&
        session.paymentIntentId !== attempt.providerIntentId) ||
      session.expiresAt.getTime() !== attempt.checkoutExpiresAt?.getTime()
    )
      throw new ConflictException('Stripe Checkout does not match this order')
  }

  private async session(attempt: PaymentAttempt): Promise<HostedSession> {
    if (attempt.checkoutSessionId)
      return this.stripe.retrieve(attempt.checkoutSessionId)
    if (Date.now() - attempt.createdAt.getTime() > 22 * 60 * 60_000) {
      await this.db.client.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'AWAITING_WEBHOOK' },
        data: { status: 'REQUIRES_REVIEW' },
      })
      throw new ConflictException(
        'This checkout needs payment reconciliation before it can be retried',
      )
    }
    if (!attempt.checkoutExpiresAt || !attempt.checkoutReturnOrigin)
      throw new ConflictException('Checkout preparation is incomplete')
    const order = await this.orders.get(
      (
        await this.db.client.order.findUniqueOrThrow({
          where: { id: attempt.orderId },
        })
      ).customerId,
      attempt.orderId,
    )
    let session: HostedSession
    try {
      session = await this.stripe.create({
        orderId: order.id,
        amountMinor: order.totalMinor,
        currency: order.currency,
        origin: attempt.checkoutReturnOrigin,
        expiresAt: attempt.checkoutExpiresAt,
        key: attempt.idempotencyKey,
        lines: order.lines,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
      })
    } catch (error) {
      // A provider 400 on the frozen create parameters proves no session was
      // created. Network/5xx uncertainty retains allocation and the same key.
      if (error instanceof CheckoutCreationRejected) await this.release(attempt)
      throw error
    }
    this.verify(attempt, session)
    const saved = await this.db.client.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        ...(session.paymentIntentId
          ? { providerIntentId: session.paymentIntentId }
          : {}),
      },
    })
    this.verify(saved, session)
    return session
  }

  private async release(attempt: PaymentAttempt) {
    await this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${attempt.orderId}::uuid FOR UPDATE`
      const order = await tx.order.findUniqueOrThrow({
        where: { id: attempt.orderId },
      })
      if (order.status !== 'PENDING_PAYMENT') return
      await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'AWAITING_WEBHOOK' },
        data: { status: 'CANCELLED' },
      })
    })
    const order = await this.db.client.order.findUniqueOrThrow({
      where: { id: attempt.orderId },
    })
    if (order.status === 'PENDING_PAYMENT')
      await this.orders.cancel(order.customerId, order.id)
  }

  async cancel(customerId: string, orderId: string) {
    const order = await this.orders.get(customerId, orderId)
    if (order.status !== 'PENDING_PAYMENT') return order
    const attempt = await this.db.client.paymentAttempt.findUnique({
      where: { orderId },
    })
    if (!attempt?.idempotencyKey.startsWith(KEY_PREFIX))
      return this.orders.cancel(customerId, orderId)
    await this.sync(attempt.id, true)
    return this.orders.get(customerId, orderId)
  }

  async sync(id: string, cancel = false) {
    const attempt = await this.db.client.paymentAttempt.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    })
    if (
      !attempt.idempotencyKey.startsWith(KEY_PREFIX) ||
      attempt.order.status !== 'PENDING_PAYMENT' ||
      attempt.status !== 'AWAITING_WEBHOOK'
    )
      return
    let session = await this.session(attempt)
    this.verify(attempt, session)
    if (
      session.status === 'open' &&
      (cancel || session.paymentFailed || session.expiresAt <= new Date())
    ) {
      try {
        session = await this.stripe.expire(session.id)
      } catch {
        session = await this.stripe.retrieve(session.id)
      }
      this.verify(attempt, session)
    }
    if (session.paymentIntentId)
      await this.db.client.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'AWAITING_WEBHOOK' },
        data: { providerIntentId: session.paymentIntentId },
      })
    if (session.status === 'expired' && session.paymentStatus === 'unpaid') {
      await this.release(attempt)
    } else if (
      session.status === 'complete' &&
      session.paymentStatus === 'paid'
    ) {
      // Keep allocation until the signed success receipt is reconciled. A
      // delayed webhook may arrive after the session's payment deadline.
      await this.db.client.order.updateMany({
        where: { id: attempt.orderId, status: 'PENDING_PAYMENT' },
        data: {
          paymentDeadlineAt: new Date(
            Math.max(
              attempt.order.paymentDeadlineAt.getTime(),
              Date.now() + RECONCILIATION_WINDOW_MS,
            ),
          ),
        },
      })
    }
  }

  async syncBatch(limit = 10) {
    const attempts = await this.db.client.paymentAttempt.findMany({
      where: {
        idempotencyKey: { startsWith: KEY_PREFIX },
        status: 'AWAITING_WEBHOOK',
        order: { status: 'PENDING_PAYMENT' },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    let pending = 0
    for (const attempt of attempts) {
      try {
        await this.sync(attempt.id)
      } catch {
        pending++
      } finally {
        await this.db.client.paymentAttempt.updateMany({
          where: { id: attempt.id, status: 'AWAITING_WEBHOOK' },
          data: { updatedAt: new Date() },
        })
      }
    }
    return { checked: attempts.length, pending }
  }
}
