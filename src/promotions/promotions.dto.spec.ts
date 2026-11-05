import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  CouponSelectionDto,
  SaveCouponDto,
  SavePromotionCampaignDto,
} from './promotions.dto'

const rules = { whitelist: true, forbidNonWhitelisted: true }
const coupon = {
  expectedRevision: 0,
  code: ' save10 ',
  kind: 'PERCENT',
  value: 1000,
  currency: 'USD',
  minimumSubtotalMinor: 0,
  enabled: true,
}

describe('promotions strict coupon/campaign boundaries', () => {
  it('normalizes a single code and accepts explicit unbounded optional rules', async () => {
    const dto = plainToInstance(SaveCouponDto, {
      ...coupon,
      startsAt: null,
      usageLimit: null,
    })
    expect(dto.code).toBe('SAVE10')
    expect(await validate(dto, rules)).toHaveLength(0)
    expect(
      await validate(plainToInstance(CouponSelectionDto, {}), rules),
    ).toHaveLength(0)
  })
  it.each([
    { code: null },
    { code: 'a' },
    { value: 1.5 },
    { currency: 'usd' },
    { minimumSubtotalMinor: -1 },
    { usageLimit: 0 },
    { maximumDiscountMinor: 0 },
    { role: 'OWNER' },
    { discountMinor: 1000 },
    { startsAt: '2026-11-02' },
    { endsAt: '2026-02-30T12:00:00Z' },
    { expectedRevision: 2147483647 },
  ])(
    'rejects malformed or client-authoritative coupon fields %j',
    async (bad) => {
      expect(
        (
          await validate(
            plainToInstance(SaveCouponDto, { ...coupon, ...bad }),
            rules,
          )
        ).length,
      ).toBeGreaterThan(0)
    },
  )
  it.each([null, '', ['SAVE10'], 123])(
    'rejects invalid checkout coupon selection %j',
    async (couponCode) => {
      expect(
        (
          await validate(
            plainToInstance(CouponSelectionDto, { couponCode }),
            rules,
          )
        ).length,
      ).toBeGreaterThan(0)
    },
  )
  it('rejects campaign HTML, unknown status, malformed timestamps and arbitrary links', async () => {
    const campaign = {
      expectedRevision: 0,
      title: 'Winter Sale',
      slug: 'winter-sale',
      description: 'Internal notes',
      status: 'DRAFT',
    }
    expect(
      await validate(
        plainToInstance(SavePromotionCampaignDto, campaign),
        rules,
      ),
    ).toHaveLength(0)
    for (const bad of [
      { title: '<script>' },
      { status: 'Published' },
      { slug: 'https://elsewhere.test' },
      { startsAt: 'tomorrow' },
      { role: 'OWNER' },
    ])
      expect(
        (
          await validate(
            plainToInstance(SavePromotionCampaignDto, { ...campaign, ...bad }),
            rules,
          )
        ).length,
      ).toBeGreaterThan(0)
  })
})
