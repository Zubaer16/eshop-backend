import { ConfigService } from '@nestjs/config'
import { ServiceUnavailableException } from '@nestjs/common'
import type { Environment } from '../../config/environment'
import {
  CheckoutCreationRejected,
  StripeCheckoutGateway,
} from './stripe-checkout-gateway'

describe('Stripe hosted Checkout boundary', () => {
  const original = global.fetch
  const orderId = '11111111-1111-4111-8111-111111111111'
  const config = {
    get: (key: string) =>
      key === 'STRIPE_TEST_ENABLED' ? true : 'sk_test_FakeCheckout12345678',
  } as unknown as ConfigService<Environment, true>
  const gateway = new StripeCheckoutGateway(config)
  const input = {
    orderId,
    amountMinor: 1050,
    currency: 'USD',
    origin: 'https://store.example.test',
    expiresAt: new Date(Date.now() + 31 * 60_000),
    key: 'hosted-checkout-' + orderId,
    lines: [{ title: 'Notebook', quantity: 2, netLineTotalMinor: 1000 }],
    shippingMinor: 50,
    taxMinor: 0,
  }
  const response = () => ({
    id: 'cs_test_FakeCheckout12345678',
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    metadata: { order_id: orderId },
    amount_total: 1050,
    currency: 'usd',
    status: 'open',
    payment_status: 'unpaid',
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    payment_intent: null,
    url: 'https://checkout.stripe.com/c/pay/cs_test_FakeCheckout12345678',
  })
  afterEach(() => {
    global.fetch = original
  })

  it('uses frozen server totals and key, card-only collection, and owned return URLs', async () => {
    const send = jest.fn().mockResolvedValue(Response.json(response()))
    global.fetch = send
    const session = await gateway.create(input)
    expect(session.orderId).toBe(orderId)
    const [url, request] = send.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    const form = new URLSearchParams(request.body as string)
    expect(form.get('mode')).toBe('payment')
    expect(form.has('automatic_tax[enabled]')).toBe(false)
    expect(form.get('line_items[2][price_data][product_data][name]')).toBeNull()
    expect(form.get('payment_method_types[]')).toBe('card')
    expect(form.get('payment_intent_data[metadata][order_id]')).toBe(orderId)
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('1000')
    expect(form.get('line_items[1][price_data][unit_amount]')).toBe('50')
    expect(form.get('success_url')).toBe(
      input.origin + '/checkout?order=' + orderId + '&result=success',
    )
    expect(form.get('cancel_url')).toBe(
      input.origin + '/checkout?order=' + orderId + '&result=cancel',
    )
    expect((request.headers as Record<string, string>)['Idempotency-Key']).toBe(
      input.key,
    )
  })

  it.each([
    { livemode: true },
    { url: 'https://evil.example/pay' },
    { url: 'https://checkout.stripe.com:444/pay' },
    { url: 'malformed' },
    { payment_status: 'paid', payment_intent: null },
    { id: 'cs_live_Invalid12345678' },
  ])('rejects malformed or unsafe provider responses %p', async (patch) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(Response.json({ ...response(), ...patch }))
    await expect(gateway.create(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })

  it('distinguishes a definite create rejection from an uncertain network result', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { message: 'private provider body' } },
          { status: 400 },
        ),
      )
    await expect(gateway.create(input)).rejects.toBeInstanceOf(
      CheckoutCreationRejected,
    )
    global.fetch = jest.fn().mockRejectedValue(new Error('network'))
    await expect(gateway.create(input)).rejects.not.toBeInstanceOf(
      CheckoutCreationRejected,
    )
  })

  it('rejects identifiers containing URL paths before making a provider call', async () => {
    const send = jest.fn()
    global.fetch = send
    expect(() => gateway.retrieve('../payment_intents')).toThrow(
      ServiceUnavailableException,
    )
    expect(send).not.toHaveBeenCalled()
  })
})
