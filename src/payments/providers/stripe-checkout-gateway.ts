import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Environment } from '../../config/environment'

export type HostedSession = {
  id: string
  orderId: string
  amountMinor: number
  currency: string
  status: 'open' | 'complete' | 'expired'
  paymentStatus: string
  paymentIntentId: string | null
  paymentFailed: boolean
  expiresAt: Date
  url: string | null
}
export class CheckoutCreationRejected extends ServiceUnavailableException {
  constructor() {
    super('Stripe Checkout could not be created. Please try checkout again.')
  }
}

@Injectable()
export class StripeCheckoutGateway {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  private async request(
    path: string,
    form?: URLSearchParams,
    key?: string,
  ): Promise<HostedSession> {
    const secret = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !/^sk_test_[A-Za-z0-9]{8,}$/.test(secret)
    )
      throw new ServiceUnavailableException('Stripe Checkout is not configured')
    let response: Response
    try {
      response = await fetch(
        'https://api.stripe.com/v1/checkout/sessions' + path,
        {
          method: form ? 'POST' : 'GET',
          headers: {
            Authorization: 'Bearer ' + secret,
            ...(form
              ? { 'Content-Type': 'application/x-www-form-urlencoded' }
              : {}),
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          ...(form ? { body: form.toString() } : {}),
          signal: AbortSignal.timeout(12_000),
        },
      )
    } catch {
      throw new ServiceUnavailableException(
        'Stripe Checkout is temporarily unavailable. Retry the same checkout.',
      )
    }
    if (!response.ok) {
      if (!path && response.status === 400) throw new CheckoutCreationRejected()
      throw new ServiceUnavailableException(
        'Stripe Checkout could not be confirmed. Retry the same checkout.',
      )
    }
    const value = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const metadata = value?.metadata as Record<string, unknown> | null
    const intent = value?.payment_intent
    const intentObject =
      typeof intent === 'object' && intent
        ? (intent as Record<string, unknown>)
        : null
    const intentId = intentObject?.id ?? intent
    let url: URL | null = null
    try {
      if (typeof value?.url === 'string') url = new URL(value.url)
    } catch {
      throw new ServiceUnavailableException(
        'Stripe Checkout returned an invalid URL',
      )
    }
    if (
      !value ||
      value.object !== 'checkout.session' ||
      value.livemode !== false ||
      value.mode !== 'payment' ||
      typeof value.id !== 'string' ||
      !/^cs_test_[A-Za-z0-9]{6,120}$/.test(value.id) ||
      typeof metadata?.order_id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(metadata.order_id) ||
      !Number.isSafeInteger(value.amount_total) ||
      (value.amount_total as number) <= 0 ||
      typeof value.currency !== 'string' ||
      !/^[a-z]{3}$/.test(value.currency) ||
      !['open', 'complete', 'expired'].includes(String(value.status)) ||
      typeof value.payment_status !== 'string' ||
      (value.payment_status === 'paid' && !intentId) ||
      !Number.isSafeInteger(value.expires_at) ||
      (intentId !== null &&
        intentId !== undefined &&
        (typeof intentId !== 'string' ||
          !/^pi_[A-Za-z0-9]{6,120}$/.test(intentId))) ||
      (url &&
        (url.protocol !== 'https:' ||
          url.origin !== 'https://checkout.stripe.com' ||
          url.username ||
          url.password))
    )
      throw new ServiceUnavailableException(
        'Stripe Checkout returned an invalid response',
      )
    return {
      id: value.id,
      orderId: metadata.order_id,
      amountMinor: value.amount_total as number,
      currency: value.currency.toUpperCase(),
      status: value.status as HostedSession['status'],
      paymentStatus: value.payment_status,
      paymentIntentId: typeof intentId === 'string' ? intentId : null,
      paymentFailed: Boolean(intentObject?.last_payment_error),
      expiresAt: new Date((value.expires_at as number) * 1000),
      url: url?.href ?? null,
    }
  }

  async create(input: {
    orderId: string
    amountMinor: number
    currency: string
    origin: string
    expiresAt: Date
    key: string
    lines: { title: string; quantity: number; netLineTotalMinor: number }[]
    shippingMinor: number
    taxMinor: number
  }) {
    const form = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[]': 'card',
      success_url:
        input.origin + '/checkout?order=' + input.orderId + '&result=success',
      cancel_url:
        input.origin + '/checkout?order=' + input.orderId + '&result=cancel',
      client_reference_id: input.orderId,
      'metadata[order_id]': input.orderId,
      'payment_intent_data[metadata][order_id]': input.orderId,
      expires_at: String(Math.floor(input.expiresAt.getTime() / 1000)),
    })
    const items = input.lines.map((line) => ({
      name: line.title + ' × ' + line.quantity,
      amount: line.netLineTotalMinor,
    }))
    if (input.shippingMinor)
      items.push({ name: 'Shipping', amount: input.shippingMinor })
    if (input.taxMinor) items.push({ name: 'Tax', amount: input.taxMinor })
    if (items.reduce((sum, item) => sum + item.amount, 0) !== input.amountMinor)
      throw new ServiceUnavailableException('Checkout total is inconsistent')
    items.forEach((item, index) => {
      form.set(
        `line_items[${index}][price_data][currency]`,
        input.currency.toLowerCase(),
      )
      form.set(
        `line_items[${index}][price_data][product_data][name]`,
        item.name.slice(0, 200),
      )
      form.set(
        `line_items[${index}][price_data][unit_amount]`,
        String(item.amount),
      )
      form.set(`line_items[${index}][quantity]`, '1')
    })
    return this.request('', form, input.key)
  }

  retrieve(id: string) {
    this.validateId(id)
    return this.request('/' + id + '?expand[]=payment_intent')
  }
  expire(id: string) {
    this.validateId(id)
    return this.request(
      '/' + id + '/expire',
      new URLSearchParams(),
      'expire-' + id,
    )
  }
  private validateId(id: string) {
    if (!/^cs_test_[A-Za-z0-9]{6,120}$/.test(id))
      throw new ServiceUnavailableException(
        'Invalid Stripe Checkout identifier',
      )
  }
}
