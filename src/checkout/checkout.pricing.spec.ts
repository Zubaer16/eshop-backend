import { estimateConfiguredCharges } from './checkout.pricing'
describe('checkout delivery arithmetic', () => {
  it('calculates merchandise and delivery with zero tax', () => {
    expect(estimateConfiguredCharges(1299, 500, null)).toEqual({
      shippingMinor: 500,
      taxMinor: 0,
      estimatedTotalMinor: 1799,
    })
  })
  it('applies the free-delivery threshold inclusively after discounts', () => {
    expect(estimateConfiguredCharges(100, 999, 100)).toEqual({
      shippingMinor: 0,
      taxMinor: 0,
      estimatedTotalMinor: 100,
    })
    expect(
      estimateConfiguredCharges(2000, 300, 1800, 400).estimatedTotalMinor,
    ).toBe(1900)
    expect(
      estimateConfiguredCharges(2000, 300, 1600, 400).estimatedTotalMinor,
    ).toBe(1600)
  })
  it('rejects unsafe money, negative charges and invalid discounts', () => {
    expect(() => estimateConfiguredCharges(2147483647, 100, null)).toThrow()
    expect(() => estimateConfiguredCharges(-1, 100, null)).toThrow()
    expect(() => estimateConfiguredCharges(100, -1, null)).toThrow()
    expect(() => estimateConfiguredCharges(100, 0, null, 101)).toThrow()
  })
})
