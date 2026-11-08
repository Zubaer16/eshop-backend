import { test, expect } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
test('public price filtering respects the requested currency and never includes drafts or fixture aliases', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const category = await (
      await request.post('/v1/admin/categories', {
        headers,
        data: { name: f.key, slug: f.slug('currency') },
      })
    ).json()
    const ids: string[] = []
    for (const [currency, status, suffix] of [
      ['USD', 'ACTIVE', 'usd'],
      ['EUR', 'ACTIVE', 'eur'],
      ['USD', 'DRAFT', 'draft'],
    ] as const) {
      const created = await request.post('/v1/admin/products', {
        headers,
        data: {
          title: 'Currency ' + f.key,
          slug: f.slug(suffix),
          sku: f.sku(suffix),
          currency,
          status,
          priceMinor: 1999,
          categoryIds: [category.id],
          stockOnHand: 1,
        },
      })
      expect(created.status()).toBe(201)
      ids.push((await created.json()).id)
    }
    const response = await request.get('/v1/products', {
      params: {
        search: f.key,
        currency: 'USD',
        minPriceMinor: 1900,
        maxPriceMinor: 2000,
      },
    })
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe(ids[0])
    expect(result.items[0].currency).toBe('USD')
    expect(
      (
        await request.get('/v1/products', { params: { currency: 'usd' } })
      ).status(),
    ).toBe(400)
    expect(
      (await request.get('/v1/products/' + f.slug('draft'))).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
