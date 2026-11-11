import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../../database/database.service'
import { Environment } from '../../config/environment'
import { RefundExecutionService } from './refund-execution.service'
import { StripeTestGateway } from '../providers/stripe-gateway'

describe('Stripe TEST refund worker safety gate', () => {
  it('allows an explicitly opted-in production showcase to reach a bounded empty batch', async () => {
    const db = {
      client: { refundRequest: { findMany: jest.fn().mockResolvedValue([]) } },
    }
    const gateway = { createRefund: jest.fn(), retrieveRefund: jest.fn() }
    const flags: Record<string, unknown> = {
      NODE_ENV: 'production',
      STRIPE_DEMO_MODE: true,
      STRIPE_TEST_ENABLED: true,
      STRIPE_TEST_REFUNDS_ENABLED: true,
    }
    const worker = new RefundExecutionService(
      db as unknown as DatabaseService,
      { get: (key: string) => flags[key] } as unknown as ConfigService<
        Environment,
        true
      >,
      gateway as unknown as StripeTestGateway,
    )
    await expect(worker.processBatch()).resolves.toMatchObject({ checked: 0 })
    expect(db.client.refundRequest.findMany).toHaveBeenCalledTimes(1)
    expect(gateway.createRefund).not.toHaveBeenCalled()
  })
  it('refuses a refund without explicit opt-in, before any DB/provider operation', async () => {
    const db = { client: { refundRequest: { findMany: jest.fn() } } }
    const gateway = { createRefund: jest.fn(), retrieveRefund: jest.fn() }
    const config = {
      get: (key: string) =>
        key === 'NODE_ENV' ? 'test' : key === 'STRIPE_TEST_ENABLED',
    }
    const worker = new RefundExecutionService(
      db as unknown as DatabaseService,
      config as unknown as ConfigService<Environment, true>,
      gateway as unknown as StripeTestGateway,
    )
    await expect(worker.processBatch()).rejects.toThrow('disabled')
    expect(db.client.refundRequest.findMany).not.toHaveBeenCalled()
    expect(gateway.createRefund).not.toHaveBeenCalled()
  })
})
