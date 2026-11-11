import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { stripeTestCapabilityEnabled } from './stripe-demo-policy'

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<
    Environment,
    true
  >

describe('production-hosted Stripe TEST showcase permission', () => {
  const all = {
    STRIPE_TEST_ENABLED: true,
    STRIPE_TEST_CHECKOUT_ENABLED: true,
    STRIPE_TEST_REFUNDS_ENABLED: true,
    STRIPE_DEMO_MODE: true,
    NODE_ENV: 'production',
  }

  it('requires explicit production showcase opt-in, not just TEST flags', () => {
    for (const capability of ['checkout', 'refunds'] as const) {
      expect(
        stripeTestCapabilityEnabled(
          config({ ...all, STRIPE_DEMO_MODE: false }),
          capability,
        ),
      ).toBe(false)
      expect(
        stripeTestCapabilityEnabled(
          config({ ...all, STRIPE_DEMO_MODE: undefined }),
          capability,
        ),
      ).toBe(false)
      expect(stripeTestCapabilityEnabled(config(all), capability)).toBe(true)
    }
  })

  it('keeps each feature independently disabled without its own flag', () => {
    expect(
      stripeTestCapabilityEnabled(
        config({ ...all, STRIPE_TEST_CHECKOUT_ENABLED: false }),
        'checkout',
      ),
    ).toBe(false)
    expect(
      stripeTestCapabilityEnabled(
        config({ ...all, STRIPE_TEST_REFUNDS_ENABLED: false }),
        'refunds',
      ),
    ).toBe(false)
    expect(
      stripeTestCapabilityEnabled(
        config({ ...all, STRIPE_TEST_ENABLED: false }),
        'checkout',
      ),
    ).toBe(false)
    expect(
      stripeTestCapabilityEnabled(
        config({ ...all, STRIPE_TEST_ENABLED: false }),
        'refunds',
      ),
    ).toBe(false)
  })

  it('retains previous nonproduction behavior without showcase flag', () => {
    for (const mode of ['test', 'development'] as const) {
      expect(
        stripeTestCapabilityEnabled(
          config({ ...all, NODE_ENV: mode, STRIPE_DEMO_MODE: false }),
          'checkout',
        ),
      ).toBe(true)
      expect(
        stripeTestCapabilityEnabled(
          config({ ...all, NODE_ENV: mode, STRIPE_DEMO_MODE: false }),
          'refunds',
        ),
      ).toBe(true)
    }
  })
})
