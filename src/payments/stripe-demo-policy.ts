import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'

/** A sandbox-only permission shared by the HTTP completion and refund workers.
 * Production deployments must opt into showcase mode explicitly. Stripe keys,
 * signed event handling, ownership and ledger invariants are checked elsewhere.
 */
export function stripeTestCapabilityEnabled(
  config: ConfigService<Environment, true>,
  capability: 'checkout' | 'refunds',
): boolean {
  if (!config.get('STRIPE_TEST_ENABLED', { infer: true })) return false
  if (
    capability === 'checkout'
      ? !config.get('STRIPE_TEST_CHECKOUT_ENABLED', { infer: true })
      : !config.get('STRIPE_TEST_REFUNDS_ENABLED', { infer: true })
  )
    return false
  return (
    config.get('NODE_ENV', { infer: true }) !== 'production' ||
    config.get('STRIPE_DEMO_MODE', { infer: true }) === true
  )
}
