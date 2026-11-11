import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { PaymentTestCompletionService } from './payment-test-completion.service'
import { StripeTestGateway } from './providers/stripe-gateway'

describe('Stripe TEST customer completion production showcase gate', () => {
  const enabled = {
    NODE_ENV: 'production',
    STRIPE_DEMO_MODE: true,
    STRIPE_TEST_ENABLED: true,
    STRIPE_TEST_CHECKOUT_ENABLED: true,
  }

  function arrange(flags: Record<string, unknown>) {
    const db = {
      client: { order: { findFirst: jest.fn().mockResolvedValue(null) } },
    }
    const gateway = {
      retrieve: jest.fn(),
      confirmTestCard: jest.fn(),
      captureTest: jest.fn(),
    }
    const service = new PaymentTestCompletionService(
      db as unknown as DatabaseService,
      { get: (key: string) => flags[key] } as unknown as ConfigService<
        Environment,
        true
      >,
      gateway as unknown as StripeTestGateway,
    )
    return { service, db, gateway }
  }

  it('rejects production completion before DB/provider access without showcase opt-in', async () => {
    const { service, db, gateway } = arrange({
      ...enabled,
      STRIPE_DEMO_MODE: false,
    })
    await expect(service.complete('customer', 'order')).rejects.toThrow(
      'disabled',
    )
    expect(db.client.order.findFirst).not.toHaveBeenCalled()
    expect(gateway.retrieve).not.toHaveBeenCalled()
  })

  it('allows an explicitly enabled production showcase through ownership verification', async () => {
    const { service, db, gateway } = arrange(enabled)
    await expect(service.complete('customer', 'order')).rejects.toThrow(
      'Order not found',
    )
    expect(db.client.order.findFirst).toHaveBeenCalledTimes(1)
    expect(gateway.retrieve).not.toHaveBeenCalled()
  })
})
