import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CheckoutItemsDto } from './checkout-items.dto'
import { normalizedItems, reservationFingerprint } from './checkout-items'
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = { id: id(1), productId: id(2), variantId: null, quantity: 12 }
function invalid(value: unknown) {
  return (
    validateSync(plainToInstance(CheckoutItemsDto, value), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).length > 0
  )
}
describe('browser cart checkout boundary', () => {
  it('accepts identity and bounded quantity while rejecting supplied money', () => {
    expect(invalid({ items: [item] })).toBe(false)
    expect(invalid({ items: [{ ...item, unitPriceMinor: 1 }] })).toBe(true)
    expect(invalid({ items: [{ ...item, quantity: 100 }] })).toBe(true)
    expect(invalid({ items: [{ ...item, quantity: 0 }] })).toBe(true)
    expect(invalid({ items: [{ ...item, quantity: 1.5 }] })).toBe(true)
    expect(invalid({ items: [] })).toBe(true)
    expect(invalid({ items: Array(51).fill(item) })).toBe(true)
  })
  it('rejects duplicate selections, line identities and case aliases', () => {
    expect(() => normalizedItems([item, { ...item, id: id(3) }])).toThrow()
    expect(() =>
      normalizedItems([item, { ...item, productId: id(3) }]),
    ).toThrow()
    expect(() => normalizedItems([{ ...item, productId: 'bad' }])).toThrow()
  })
  it('freezes item identity, quantities and checkout policy in replay fingerprints', () => {
    const input = { items: [item], countryCode: 'US' }
    expect(reservationFingerprint(input)).toBe(
      reservationFingerprint({ ...input, items: [{ ...item }] }),
    )
    expect(reservationFingerprint(input)).not.toBe(
      reservationFingerprint({ ...input, items: [{ ...item, quantity: 10 }] }),
    )
    expect(reservationFingerprint(input)).not.toBe(
      reservationFingerprint({ ...input, couponCode: 'SALE' }),
    )
  })
})
