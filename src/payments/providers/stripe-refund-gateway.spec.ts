import { ConfigService } from '@nestjs/config'
import { Environment } from '../../config/environment'
import { StripeTestGateway } from './stripe-gateway'

describe('Stripe TEST refund API adapter', () => {
  it('never calls Stripe refund API in production without explicit showcase mode', async () => {
    const config = {
      get: (key: string) =>
        key === 'NODE_ENV'
          ? 'production'
          : key === 'STRIPE_DEMO_MODE'
            ? false
            : key === 'STRIPE_TEST_SECRET_KEY'
              ? 'sk_test_TESTONLY123456789012345'
              : true,
    }
    const gateway = new StripeTestGateway(
      config as unknown as ConfigService<Environment, true>,
    )
    const remote = jest.spyOn(global, 'fetch')
    try {
      await expect(
        gateway.retrieveRefund('re_TestRefund123456789'),
      ).rejects.toThrow('disabled')
      expect(remote).not.toHaveBeenCalled()
    } finally {
      remote.mockRestore()
    }
  })
  it('allows provider refund retrieval in an explicitly enabled production sandbox showcase', async () => {
    const flags: Record<string, unknown> = {
      NODE_ENV: 'production',
      STRIPE_DEMO_MODE: true,
      STRIPE_TEST_ENABLED: true,
      STRIPE_TEST_REFUNDS_ENABLED: true,
      STRIPE_TEST_SECRET_KEY: 'sk_test_TESTONLY123456789012345',
    }
    const gateway = new StripeTestGateway({
      get: (key: string) => flags[key],
    } as unknown as ConfigService<Environment, true>)
    const originalFetch = global.fetch
    const remote = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 're_TestRefund123456789',
            object: 'refund',
            status: 'succeeded',
            livemode: false,
            amount: 100,
            currency: 'usd',
            payment_intent: 'pi_TestIntent123456789',
            metadata: {
              order_id: '11111111-1111-4111-8111-111111111111',
              refund_request_id: '22222222-2222-4222-8222-222222222222',
            },
          }),
          { status: 200 },
        ),
    )
    global.fetch = remote as typeof fetch
    try {
      await expect(
        gateway.retrieveRefund('re_TestRefund123456789'),
      ).resolves.toMatchObject({
        livemode: false,
        status: 'succeeded',
      })
      expect(remote).toHaveBeenCalledTimes(1)
    } finally {
      global.fetch = originalFetch
    }
  })
  it('accepts documented Refund objects without a livemode field only when TEST credentials are enabled', async () => {
    const config = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'test'
        if (
          key === 'STRIPE_TEST_ENABLED' ||
          key === 'STRIPE_TEST_REFUNDS_ENABLED'
        )
          return true
        if (key === 'STRIPE_TEST_SECRET_KEY')
          return 'sk_test_TESTONLY123456789012345'
        return ''
      },
    }
    const originalFetch = global.fetch
    const remote = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 're_TestRefund123456789',
            object: 'refund',
            status: 'succeeded',
            amount: 100,
            currency: 'usd',
            payment_intent: 'pi_TestIntent123456789',
            metadata: {
              order_id: '11111111-1111-4111-8111-111111111111',
              refund_request_id: '22222222-2222-4222-8222-222222222222',
            },
          }),
          { status: 200 },
        ),
    )
    global.fetch = remote as typeof fetch
    try {
      const gateway = new StripeTestGateway(
        config as unknown as ConfigService<Environment, true>,
      )
      const verified = await gateway.retrieveRefund('re_TestRefund123456789')
      expect(verified.status).toBe('succeeded')
      expect(verified.livemode).toBe(false)
      expect(verified.amountMinor).toBe(100)
      expect(remote).toHaveBeenCalledTimes(1)
    } finally {
      global.fetch = originalFetch
    }
  })
})
