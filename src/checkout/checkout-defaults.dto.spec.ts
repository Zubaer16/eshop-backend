import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { PutCheckoutDefaultRateDto } from './checkout.dto'
const input = {
  currency: 'USD',
  expectedRevision: 0,
  shippingMinor: 500,
  freeOverSubtotalMinor: null,
}
const invalid = (value: unknown) =>
  validateSync(plainToInstance(PutCheckoutDefaultRateDto, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).length > 0

describe('default delivery rate input', () => {
  it('accepts bounded explicit prices and a revision', () => {
    expect(invalid(input)).toBe(false)
    expect(invalid({ ...input, shippingMinor: 0 })).toBe(false)
  })
  it.each([
    { ...input, shippingMinor: -1 },
    { ...input, shippingMinor: 1.5 },
    { ...input, shippingMinor: 2147483648 },
    { ...input, taxBps: 10001 },
    { ...input, taxBps: -1 },
    { ...input, freeOverSubtotalMinor: -1 },
    { ...input, expectedRevision: -1 },
    { ...input, currency: 'usd' },
    { ...input, countryCode: 'BD' },
    { ...input, enabled: true },
  ])('rejects invalid or unrelated fields %#', (value) =>
    expect(invalid(value)).toBe(true),
  )
})
