import { allocateDiscount } from './promotions.policy'
import { estimateConfiguredCharges } from '../checkout/checkout.pricing'

describe('promotions exact discount allocation and charge arithmetic', () => {
  it('rounds percentage once, allocates largest remainders deterministically and excludes ineligible lines', () => {
    const lines = [
      { id: 'b', amountMinor: 5, eligible: true },
      { id: 'a', amountMinor: 5, eligible: true },
      { id: 'z', amountMinor: 1000, eligible: false },
    ]
    const result = allocateDiscount('PERCENT', 1000, null, lines)
    expect(result).toEqual({
      discountMinor: 1,
      eligibleSubtotalMinor: 10,
      lineDiscounts: { a: 1, b: 0, z: 0 },
    })
    expect(
      allocateDiscount('PERCENT', 1000, null, [...lines].reverse()),
    ).toEqual(result)
  })
  it('caps fixed and percentage discounts at eligible amounts and the explicit cap', () => {
    const lines = [{ id: 'a', amountMinor: 1299, eligible: true }]
    expect(allocateDiscount('FIXED', 2000, null, lines).discountMinor).toBe(
      1299,
    )
    expect(allocateDiscount('PERCENT', 10000, 500, lines).discountMinor).toBe(
      500,
    )
    expect(allocateDiscount('PERCENT', 1000, null, lines).discountMinor).toBe(
      130,
    )
    expect(
      allocateDiscount('FIXED', 200, null, [{ ...lines[0]!, eligible: false }])
        .discountMinor,
    ).toBe(0)
  })
  it('conserves every minor unit across uneven eligible lines without over-discounting any line', () => {
    for (let n = 1; n <= 50; n++) {
      const lines = Array.from({ length: n }, (_, i) => ({
        id: String(i).padStart(2, '0'),
        amountMinor: i * 17 + 1,
        eligible: i % 3 !== 0,
      }))
      const result = allocateDiscount('PERCENT', 3333, null, lines)
      expect(
        Object.values(result.lineDiscounts).reduce((a, b) => a + b, 0),
      ).toBe(result.discountMinor)
      for (const line of lines) {
        expect(result.lineDiscounts[line.id]).toBeGreaterThanOrEqual(0)
        expect(result.lineDiscounts[line.id]).toBeLessThanOrEqual(
          line.eligible ? line.amountMinor : 0,
        )
      }
    }
  })
  it('taxes discounted merchandise and evaluates free shipping on that same net basis', () => {
    expect(estimateConfiguredCharges(2000, 300, 1800, 1000, 400)).toEqual({
      shippingMinor: 300,
      taxMinor: 160,
      estimatedTotalMinor: 2060,
    })
    expect(estimateConfiguredCharges(2000, 300, 1600, 1000, 400)).toEqual({
      shippingMinor: 0,
      taxMinor: 160,
      estimatedTotalMinor: 1760,
    })
    expect(() => estimateConfiguredCharges(100, 0, null, 0, 101)).toThrow()
    expect(() => estimateConfiguredCharges(100, 0, null, 0, -1)).toThrow()
  })
  it('rejects unsupported rule and money bounds rather than silently rounding invalid input', () => {
    const lines = [{ id: 'a', amountMinor: 1, eligible: true }]
    expect(() => allocateDiscount('PERCENT', 10001, null, lines)).toThrow()
    expect(() => allocateDiscount('FIXED', 1.5, null, lines)).toThrow()
    expect(() => allocateDiscount('FIXED', 1, 0, lines)).toThrow()
    expect(() =>
      allocateDiscount('FIXED', 1, null, [...lines, ...lines]),
    ).toThrow()
    expect(() =>
      allocateDiscount('FIXED', 1, null, [
        { ...lines[0]!, amountMinor: 2147483648 },
      ]),
    ).toThrow()
  })
})
