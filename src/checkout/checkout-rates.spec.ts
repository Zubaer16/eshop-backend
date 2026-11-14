import type { Prisma } from '../generated/prisma/client'
import { resolveCheckoutRate } from './checkout-rates'

describe('optional delivery policies', () => {
  function transaction(country: unknown, defaults: unknown) {
    return {
      checkoutRate: { findUnique: jest.fn().mockResolvedValue(country) },
      checkoutDefaultRate: {
        findUnique: jest.fn().mockResolvedValue(defaults),
      },
    } as unknown as Prisma.TransactionClient
  }
  it('uses an enabled country delivery rate', async () => {
    const rate = {
      enabled: true,
      shippingMinor: 300,
      freeOverSubtotalMinor: null,
    }
    const tx = transaction(rate, { shippingMinor: 500 })
    expect(await resolveCheckoutRate(tx, 'BD', 'USD')).toEqual(rate)
    expect(tx.checkoutDefaultRate.findUnique).not.toHaveBeenCalled()
  })
  it('uses a currency default when the country override is disabled', async () => {
    const rate = { shippingMinor: 500, freeOverSubtotalMinor: 10000 }
    const tx = transaction({ enabled: false }, rate)
    expect(await resolveCheckoutRate(tx, 'BD', 'USD')).toEqual(rate)
    expect(tx.checkoutDefaultRate.findUnique).toHaveBeenCalledWith({
      where: { currency: 'USD' },
    })
  })
  it('uses zero delivery charges when nothing is configured', async () => {
    expect(
      await resolveCheckoutRate(transaction(null, null), 'BD', 'USD'),
    ).toEqual({ shippingMinor: 0, freeOverSubtotalMinor: null })
  })
})
