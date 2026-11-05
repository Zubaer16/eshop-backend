import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  PromotionsFixture,
  couponInput,
} from '../api-tests/promotions-test-support'
import { bearer } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('promotions Swagger Chromium: marketing coupon/campaign CRUD, revision, privacy and soft deletion', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new PromotionsFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/promotions/coupons', 401)
    await authorizeInSwagger(page, owner.token)
    const input = couponInput(f.code())
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/promotions/coupons',
      201,
      input,
    )
    const coupon = await created.json()
    f.couponIds.push(coupon.id)
    expect(coupon).toMatchObject({ code: input.code, revision: 1 })
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/promotions/coupons/{id}',
      200,
      undefined,
      { id: coupon.id },
    )
    const updated = await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/promotions/coupons/{id}',
      200,
      {
        ...input,
        expectedRevision: 1,
        kind: 'FIXED',
        value: 200,
      },
      { id: coupon.id },
    )
    expect((await updated.json()).revision).toBe(2)
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/promotions/coupons/{id}',
      409,
      {
        ...input,
        expectedRevision: 1,
      },
      { id: coupon.id },
    )
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/promotions/coupons/{id}/usage',
      200,
      undefined,
      { id: coupon.id },
    )
    const campaign = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/promotions/campaigns',
      201,
      {
        expectedRevision: 0,
        title: 'promotions Browser Sale',
        slug: f.slug('browser-sale'),
        description: 'Private campaign notes',
        status: 'SCHEDULED',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
      },
    )
    const campaignId = (await campaign.json()).id as string
    f.campaignIds.push(campaignId)
    const publicResponse = await swaggerExecute(
      page,
      'GET',
      '/v1/promotions/campaigns',
      200,
      undefined,
      {},
      { limit: 50 },
    )
    const publicCampaign = (await publicResponse.json()).find(
      (row: { id: string }) => row.id === campaignId,
    )
    expect(Object.keys(publicCampaign).sort()).toEqual([
      'endsAt',
      'id',
      'slug',
      'startsAt',
      'title',
    ])
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/promotions/campaigns/{id}',
      200,
      undefined,
      { id: campaignId },
      { expectedRevision: 1 },
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/promotions/coupons/{id}',
      200,
      undefined,
      { id: coupon.id },
      { expectedRevision: 2 },
    )
    expect(
      await f.db.coupon.findUnique({ where: { id: coupon.id } }),
    ).toMatchObject({ enabled: false, revision: 3 })
  } finally {
    await f.close()
  }
})

test('promotions Swagger Chromium: customer discounted delivery quote, hold/retry/order and forged total rejection', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const product = await f.product(owner.token)
    const coupon = await f.coupon(owner.token)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId: product.id, quantity: 1 },
        })
      ).status(),
    ).toBe(200)
    await openSwagger(page)
    await swaggerExecute(page, 'POST', '/v1/checkout/estimate', 401, {
      countryCode: f.countryCode,
      couponCode: coupon.code,
    })
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/promotions/coupons',
      403,
      couponInput(f.code('DENIED')),
    )
    const params = { countryCode: f.countryCode, couponCode: coupon.code }
    const available = await swaggerExecute(
      page,
      'GET',
      '/v1/checkout/delivery-options',
      200,
      undefined,
      {},
      params,
    )
    expect(await available.json()).toMatchObject({
      discountMinor: 130,
      options: [{ totalMinor: 1385 }],
    })
    await swaggerExecute(page, 'POST', '/v1/checkout/estimate', 400, {
      ...params,
      discountMinor: 1000,
    })
    const quote = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/estimate',
      200,
      params,
    )
    expect(await quote.json()).toMatchObject({
      discountMinor: 130,
      estimatedTotalMinor: 1385,
    })
    const holdInput = { ...params, requestId: randomUUID() }
    const holdResponse = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/reservations',
      200,
      holdInput,
    )
    const hold = await holdResponse.json()
    const retry = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/reservations',
      200,
      holdInput,
    )
    expect((await retry.json()).id).toBe(hold.id)
    const order = await swaggerExecute(page, 'POST', '/v1/orders', 200, {
      requestId: randomUUID(),
      reservationId: hold.id,
      shippingAddress: f.address(),
    })
    expect(await order.json()).toMatchObject({
      discountMinor: 130,
      totalMinor: 1385,
      couponCode: coupon.code,
      lines: [{ discountMinor: 130, netLineTotalMinor: 1169 }],
    })
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(1)
  } finally {
    await f.close()
  }
})
