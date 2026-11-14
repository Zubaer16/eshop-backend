import type { Prisma } from '../generated/prisma/client'

/** Money is resolved in the cart currency. An absent charge means free delivery. */
export async function resolveCheckoutRate(
  tx: Prisma.TransactionClient,
  countryCode: string,
  currency: string,
) {
  const countryRate = await tx.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  if (countryRate?.enabled) return countryRate
  const defaults = await tx.checkoutDefaultRate.findUnique({
    where: { currency },
  })
  return defaults ?? { shippingMinor: 0, freeOverSubtotalMinor: null }
}
