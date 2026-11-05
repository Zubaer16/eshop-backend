import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import type { CheckoutRate } from '../src/generated/prisma/client'

export const couponInput = (code: string) => ({
  expectedRevision: 0,
  code,
  kind: 'PERCENT',
  value: 1000,
  currency: 'USD',
  minimumSubtotalMinor: 0,
  maximumDiscountMinor: null,
  usageLimit: null,
  perCustomerLimit: null,
  startsAt: null,
  endsAt: null,
  categoryId: null,
  campaignId: null,
  enabled: true,
})

export class PromotionsFixture extends CatalogTestFixture {
  readonly couponIds: string[] = []
  readonly campaignIds: string[] = []
  countryCode = 'TF'
  private priorRate: CheckoutRate | null = null
  private rateChanged = false

  constructor(readonly http: APIRequestContext) {
    super(http)
  }

  code(suffix = '') {
    return ('PM_' + this.key + suffix).toUpperCase()
  }

  async rate() {
    for (const code of ['TF', 'GS', 'HM', 'PN', 'NU', 'TK', 'WF', 'NC', 'PF']) {
      if (
        !(await this.db.deliveryZoneCountry.findUnique({
          where: {
            countryCode_currency: { countryCode: code, currency: 'USD' },
          },
        }))
      ) {
        this.countryCode = code
        break
      }
    }
    this.priorRate = await this.db.checkoutRate.findUnique({
      where: {
        countryCode_currency: {
          countryCode: this.countryCode,
          currency: 'USD',
        },
      },
    })
    await this.db.checkoutRate.upsert({
      where: {
        countryCode_currency: {
          countryCode: this.countryCode,
          currency: 'USD',
        },
      },
      create: {
        countryCode: this.countryCode,
        currency: 'USD',
        shippingMinor: 99,
        freeOverSubtotalMinor: 1200,
        taxBps: 1000,
        enabled: true,
      },
      update: {
        shippingMinor: 99,
        freeOverSubtotalMinor: 1200,
        taxBps: 1000,
        enabled: true,
      },
    })
    this.rateChanged = true
  }

  async product(
    token: string,
    label = 'item',
    priceMinor = 1299,
    stockOnHand = 20,
  ) {
    const category = await this.http.post('/v1/admin/categories', {
      headers: bearer(token),
      data: { name: 'promotions Category', slug: this.slug(label + '-cat') },
    })
    expect(category.status()).toBe(201)
    const categoryId = (await category.json()).id as string
    const response = await this.http.post('/v1/admin/products', {
      headers: bearer(token),
      data: {
        title: 'promotions Product',
        slug: this.slug(label),
        sku: this.sku(label),
        priceMinor,
        currency: 'USD',
        status: 'ACTIVE',
        stockOnHand,
        categoryIds: [categoryId],
      },
    })
    expect(response.status()).toBe(201)
    return { ...((await response.json()) as { id: string }), categoryId }
  }

  async coupon(token: string, overrides: Record<string, unknown> = {}) {
    const response = await this.http.post('/v1/admin/promotions/coupons', {
      headers: bearer(token),
      data: {
        ...couponInput(this.code(String(this.couponIds.length))),
        ...overrides,
      },
    })
    expect(response.status()).toBe(201)
    const row = (await response.json()) as {
      id: string
      code: string
      revision: number
    }
    this.couponIds.push(row.id)
    return row
  }

  async campaign(token: string, overrides: Record<string, unknown> = {}) {
    const response = await this.http.post('/v1/admin/promotions/campaigns', {
      headers: bearer(token),
      data: {
        expectedRevision: 0,
        title: 'promotions Campaign',
        slug: this.slug('campaign-' + this.campaignIds.length),
        description: 'Private campaign notes',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        ...overrides,
      },
    })
    expect(response.status()).toBe(201)
    const row = (await response.json()) as { id: string; revision: number }
    this.campaignIds.push(row.id)
    return row
  }

  address() {
    return {
      recipientName: 'promotions Customer',
      phone: '+12025550120',
      addressLine1: '5 Coupon Road',
      city: 'Example',
      countryCode: this.countryCode,
    }
  }

  override async close() {
    try {
      // Test-owned identifiers only. Production endpoints never hard-delete rule/ledger history.
      await this.db.couponRedemption.deleteMany({
        where: { couponId: { in: this.couponIds } },
      })
      await this.db.coupon.deleteMany({ where: { id: { in: this.couponIds } } })
      await this.db.promotionCampaign.deleteMany({
        where: { id: { in: this.campaignIds } },
      })
      if (this.rateChanged) {
        if (this.priorRate)
          await this.db.checkoutRate.upsert({
            where: {
              countryCode_currency: {
                countryCode: this.countryCode,
                currency: 'USD',
              },
            },
            create: this.priorRate,
            update: this.priorRate,
          })
        else
          await this.db.checkoutRate.deleteMany({
            where: { countryCode: this.countryCode, currency: 'USD' },
          })
      }
    } finally {
      await super.close()
    }
  }
}
