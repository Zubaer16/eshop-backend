import { createHmac, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ConfigService } from '@nestjs/config'
import { bearer } from './catalog-test-support'
import { couponInput, PromotionsFixture } from './promotions-test-support'
import { DatabaseService } from '../src/database/database.service'
import type { Environment } from '../src/config/environment'
import { PaymentsService } from '../src/payments/payments.service'
import { PaymentSettlementService } from '../src/payments/payment-settlement.service'
import { StripeTestGateway } from '../src/payments/providers/stripe-gateway'

test('promotions DB: discount quote/hold/order snapshots, retry, post-discount tax/shipping and unpaid cancellation quota release', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const headers = bearer(customer.token),
      admin = bearer(owner.token)
    const product = await f.product(owner.token)
    f.selectItems(headers, { productId: product.id, quantity: 1 })
    const coupon = await f.coupon(owner.token, { usageLimit: 1 })
    const input = {
      countryCode: f.countryCode,
      couponCode: coupon.code.toLowerCase(),
    }
    const estimate = await request.post('/v1/checkout/estimate', {
      headers,
      data: { ...input, items: f.selections(headers) },
    })
    expect(estimate.status()).toBe(200)
    expect(await estimate.json()).toMatchObject({
      subtotalMinor: 1299,
      discountMinor: 130,
      shippingMinor: 99,
      taxMinor: 0,
      estimatedTotalMinor: 1268,
      couponCode: coupon.code,
    })
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(0)
    const options = await request.post('/v1/checkout/delivery-options', {
      headers,
      data: { ...input, items: f.selections(headers) },
    })
    expect(options.status()).toBe(200)
    expect(await options.json()).toMatchObject({
      discountMinor: 130,
      options: [{ totalMinor: 1268 }],
    })
    const requestId = randomUUID()
    const reserve = () =>
      request.post('/v1/checkout/reservations', {
        headers,
        data: { ...{ ...input, requestId }, items: f.selections(headers) },
      })
    const holds = await Promise.all([reserve(), reserve()])
    expect(holds.map((r) => r.status())).toEqual([200, 200])
    const hold = await holds[0]!.json()
    expect((await holds[1]!.json()).id).toBe(hold.id)
    expect(hold).toMatchObject({
      discountMinor: 130,
      estimatedTotalMinor: 1268,
      items: [{ discountMinor: 130 }],
    })
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(1)
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers,
          data: {
            ...{ requestId, countryCode: f.countryCode },
            items: f.selections(headers),
          },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.put('/v1/admin/promotions/coupons/' + coupon.id, {
          headers: admin,
          data: {
            ...couponInput(coupon.code),
            expectedRevision: 1,
            kind: 'FIXED',
            value: 500,
          },
        })
      ).status(),
    ).toBe(200)
    const orderInput = {
      requestId: randomUUID(),
      reservationId: hold.id,
      shippingAddress: f.address(),
    }
    const orderResponse = await request.post('/v1/orders', {
      headers,
      data: orderInput,
    })
    expect(orderResponse.status()).toBe(200)
    const order = await orderResponse.json()
    expect(order).toMatchObject({
      discountMinor: 130,
      totalMinor: 1268,
      couponSnapshot: { revision: 1, kind: 'PERCENT', value: 1000 },
      lines: [
        { lineTotalMinor: 1299, discountMinor: 130, netLineTotalMinor: 1169 },
      ],
    })
    expect(
      (
        await request.post('/v1/orders', { headers, data: orderInput })
      ).status(),
    ).toBe(200)
    const adminOrder = await request.get('/v1/admin/orders/' + order.id, {
      headers: admin,
    })
    expect(await adminOrder.json()).toMatchObject({
      discountMinor: 130,
      couponCode: coupon.code,
    })
    const usage = () =>
      request.get('/v1/admin/promotions/coupons/' + coupon.id + '/usage', {
        headers: admin,
      })
    expect(await (await usage()).json()).toMatchObject({ activeClaims: 1 })
    expect(
      (
        await request.post('/v1/orders/' + order.id + '/cancel', { headers })
      ).status(),
    ).toBe(200)
    expect(await (await usage()).json()).toMatchObject({ activeClaims: 0 })
    expect(
      await (await request.get('/v1/orders/' + order.id, { headers })).json(),
    ).toMatchObject({ discountMinor: 130, totalMinor: 1268 })
    expect(
      await (
        await request.post('/v1/checkout/estimate', {
          headers,
          data: { ...input, items: f.selections(headers) },
        })
      ).json(),
    ).toMatchObject({ discountMinor: 500, estimatedTotalMinor: 898 })
  } finally {
    await f.close()
  }
})

test('promotions DB: last global coupon slot is serialized across customers; release and expiry recover capacity without delayed cleanup', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER')
    const users = await Promise.all([
      f.account('CUSTOMER'),
      f.account('CUSTOMER'),
    ])
    const product = await f.product(owner.token)
    const coupon = await f.coupon(owner.token, {
      usageLimit: 1,
      perCustomerLimit: 1,
    })
    for (const user of users)
      f.selectItems(bearer(user.token), { productId: product.id, quantity: 1 })
    const reserve = (index: number) =>
      request.post('/v1/checkout/reservations', {
        headers: bearer(users[index]!.token),
        data: {
          ...{
            requestId: randomUUID(),
            countryCode: f.countryCode,
            couponCode: coupon.code,
          },
          items: f.selections(bearer(users[index]!.token)),
        },
      })
    const results = await Promise.all([reserve(0), reserve(1)])
    expect(results.map((r) => r.status()).sort()).toEqual([200, 422])
    const winner = results[0]!.status() === 200 ? 0 : 1,
      loser = 1 - winner
    const hold = await results[winner]!.json()
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(1)
    expect(
      (
        await request.delete('/v1/checkout/reservations/' + hold.id, {
          headers: bearer(users[winner]!.token),
        })
      ).status(),
    ).toBe(200)
    const next = await reserve(loser)
    expect(next.status()).toBe(200)
    await f.db.checkoutReservation.update({
      where: { id: (await next.json()).id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const afterExpiry = await reserve(winner)
    expect(afterExpiry.status()).toBe(200)
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: product.id },
    })
    expect(balance.reservedQuantity).toBe(2) // One physically uncleaned expired hold and one active hold; no oversell.
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(3)
  } finally {
    await f.close()
  }
})

test('promotions DB: exact category eligibility, fixed cap, disabled/expired/currency/minimum checks, zero-total and stock fences', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const headers = bearer(customer.token)
    const a = await f.product(owner.token, 'eligible', 500, 1)
    const b = await f.product(owner.token, 'other', 1000)
    for (const product of [a, b])
      f.selectItems(headers, { productId: product.id, quantity: 1 })
    const coupon = await f.coupon(owner.token, {
      kind: 'FIXED',
      value: 900,
      categoryId: a.categoryId,
      maximumDiscountMinor: 400,
    })
    const quote = (code: string) =>
      request.post('/v1/checkout/estimate', {
        headers,
        data: {
          ...{ countryCode: f.countryCode, couponCode: code },
          items: f.selections(headers),
        },
      })
    expect(await (await quote(coupon.code)).json()).toMatchObject({
      discountMinor: 400,
      shippingMinor: 99,
      taxMinor: 0,
      estimatedTotalMinor: 1199,
    })
    for (const bad of [
      { enabled: false },
      { endsAt: new Date(Date.now() - 10000).toISOString() },
      { startsAt: new Date(Date.now() + 100000).toISOString() },
      { currency: 'BDT' },
      { minimumSubtotalMinor: 1501 },
      { categoryId: (await f.product(owner.token, 'absent')).categoryId },
    ]) {
      const denied = await f.coupon(owner.token, bad)
      expect((await quote(denied.code)).status()).toBe(422)
    }
    expect((await quote('UNKNOWN123')).status()).toBe(422)
    // An invalid stock quote must never create a quota claim.
    await f.db.inventoryBalance.update({
      where: { productId: a.id },
      data: { onHand: 0 },
    })
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers,
          data: {
            ...{
              requestId: randomUUID(),
              countryCode: f.countryCode,
              couponCode: coupon.code,
            },
            items: f.selections(headers),
          },
        })
      ).status(),
    ).toBe(409)
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(0)
    await f.db.inventoryBalance.update({
      where: { productId: a.id },
      data: { onHand: 1 },
    })
    await f.db.checkoutRate.update({
      where: {
        countryCode_currency: { countryCode: f.countryCode, currency: 'USD' },
      },
      data: { shippingMinor: 0, freeOverSubtotalMinor: null },
    })
    const free = await f.coupon(owner.token, { value: 10000 })
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers,
          data: {
            ...{
              requestId: randomUUID(),
              countryCode: f.countryCode,
              couponCode: free.code,
            },
            items: f.selections(headers),
          },
        })
      ).status(),
    ).toBe(422)
    expect(
      await f.db.couponRedemption.count({ where: { couponId: free.id } }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})

test('promotions DB: campaign scheduling/public privacy, linked coupon gating, revision conflicts, search and soft removal', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const admin = bearer(owner.token),
      headers = bearer(customer.token)
    const product = await f.product(owner.token)
    f.selectItems(headers, { productId: product.id, quantity: 1 })
    const active = await f.campaign(owner.token, { status: 'SCHEDULED' })
    const future = await f.campaign(owner.token, {
      startsAt: new Date(Date.now() + 100000).toISOString(),
    })
    const draft = await f.campaign(owner.token, { status: 'DRAFT' })
    const publicRows = await (
      await request.get('/v1/promotions/campaigns', { params: { limit: 50 } })
    ).json()
    expect(publicRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: active.id })]),
    )
    expect(
      publicRows.find(
        (r: { id: string }) => r.id === future.id || r.id === draft.id,
      ),
    ).toBeUndefined()
    const visible = publicRows.find((r: { id: string }) => r.id === active.id)
    expect(Object.keys(visible).sort()).toEqual([
      'endsAt',
      'id',
      'slug',
      'startsAt',
      'title',
    ])
    const coupon = await f.coupon(owner.token, { campaignId: active.id })
    const quote = () =>
      request.post('/v1/checkout/estimate', {
        headers,
        data: {
          ...{ countryCode: f.countryCode, couponCode: coupon.code },
          items: f.selections(headers),
        },
      })
    expect((await quote()).status()).toBe(200)
    expect(
      (
        await request.delete('/v1/admin/promotions/campaigns/' + active.id, {
          headers: admin,
          params: { expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200)
    expect((await quote()).status()).toBe(422)
    expect(
      (
        await request.delete('/v1/admin/promotions/campaigns/' + active.id, {
          headers: admin,
          params: { expectedRevision: 1 },
        })
      ).status(),
    ).toBe(409)
    const edits = await Promise.all(
      [1, 2].map(() =>
        request.put('/v1/admin/promotions/coupons/' + coupon.id, {
          headers: admin,
          data: { ...couponInput(coupon.code), expectedRevision: 1 },
        }),
      ),
    )
    expect(edits.map((r) => r.status()).sort()).toEqual([200, 409])
    expect(
      (
        await request.post('/v1/admin/promotions/coupons', {
          headers: admin,
          data: couponInput(coupon.code.toLowerCase()),
        })
      ).status(),
    ).toBe(409)
    const list = await request.get('/v1/admin/promotions/coupons', {
      headers: admin,
      params: { search: coupon.code, page: 1, limit: 1 },
    })
    expect(await list.json()).toMatchObject({
      total: 1,
      page: 1,
      limit: 1,
      items: [{ id: coupon.id }],
    })
    expect(
      (
        await request.delete('/v1/admin/promotions/coupons/' + coupon.id, {
          headers: admin,
          params: { expectedRevision: 2 },
        })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.coupon.findUnique({ where: { id: coupon.id } }),
    ).toMatchObject({ enabled: false, revision: 3 })
    expect((await quote()).status()).toBe(422)
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'promotion.coupon.updated',
          targetId: coupon.id,
        },
      }),
    ).toBe(1)
  } finally {
    await f.close()
  }
})

test('promotions DB: discounted amount drives verified settlement/refund ceiling; paid refund keeps usage and never restocks', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  const eventId = 'evt_G4' + randomUUID().replaceAll('-', '')
  try {
    await f.rate()
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const headers = bearer(customer.token),
      admin = bearer(owner.token)
    const product = await f.product(owner.token)
    f.selectItems(headers, { productId: product.id, quantity: 1 })
    const coupon = await f.coupon(owner.token, {
      usageLimit: null,
      perCustomerLimit: 1,
    })
    const holdResponse = await request.post('/v1/checkout/reservations', {
      headers,
      data: {
        ...{
          requestId: randomUUID(),
          countryCode: f.countryCode,
          couponCode: coupon.code,
        },
        items: f.selections(headers),
      },
    })
    expect(holdResponse.status()).toBe(200)
    const orderResponse = await request.post('/v1/orders', {
      headers,
      data: {
        requestId: randomUUID(),
        reservationId: (await holdResponse.json()).id,
        shippingAddress: f.address(),
      },
    })
    expect(orderResponse.status()).toBe(200)
    const order = (await orderResponse.json()) as {
      id: string
      totalMinor: number
    }
    expect(order.totalMinor).toBe(1268)
    const secret = 'whsec_G4TESTONLY12345678901234567890'
    const config = {
      get: (name: string) =>
        ({ STRIPE_TEST_ENABLED: true, STRIPE_TEST_WEBHOOK_SECRET: secret })[
          name
        ],
    } as unknown as ConfigService<Environment, true>
    const providerId = 'pi_G4' + f.key + '12345678'
    let preparedAmount = 0
    const gateway = {
      prepare: async (input: { amountMinor: number }) => {
        preparedAmount = input.amountMinor
        return { id: providerId, status: 'requires_payment_method' }
      },
      retrieve: async () => ({
        id: providerId,
        status: 'succeeded',
        amountMinor: 1268,
        amountReceivedMinor: 1268,
        currency: 'USD',
        orderId: order.id,
        livemode: false,
      }),
    } as unknown as StripeTestGateway
    const db = { client: f.db } as unknown as DatabaseService
    const payments = new PaymentsService(db, config, gateway)
    await payments.prepare(customer.id, order.id)
    expect(preparedAmount).toBe(1268)
    const raw = Buffer.from(
      JSON.stringify({
        id: eventId,
        type: 'payment_intent.succeeded',
        livemode: false,
        data: { object: { object: 'payment_intent', id: providerId } },
      }),
    )
    const t = Math.floor(Date.now() / 1000)
    const sig =
      't=' +
      t +
      ',v1=' +
      createHmac('sha256', secret)
        .update(String(t) + '.')
        .update(raw)
        .digest('hex')
    await payments.receiveWebhook(raw, sig)
    const receipt = await f.db.paymentWebhookReceipt.findUniqueOrThrow({
      where: { providerEventId: eventId },
    })
    expect(
      await new PaymentSettlementService(db, config, gateway).reconcileReceipt(
        receipt.id,
      ),
    ).toBe('SETTLED')
    expect(
      (
        await request.post(
          '/v1/admin/payments/orders/' + order.id + '/refunds',
          {
            headers: admin,
            data: {
              requestId: randomUUID(),
              amountMinor: 1386,
              reason: 'OTHER',
            },
          },
        )
      ).status(),
    ).toBe(409)
    const refunded = await request.post(
      '/v1/admin/payments/orders/' + order.id + '/refunds',
      {
        headers: admin,
        data: { requestId: randomUUID(), amountMinor: 1268, reason: 'OTHER' },
      },
    )
    expect(refunded.status()).toBe(200)
    const refundId = (await refunded.json()).id as string
    await f.db.refundRequest.update({
      where: { id: refundId },
      data: { status: 'SUCCEEDED' },
    })
    expect(
      await (
        await request.get(
          '/v1/admin/promotions/coupons/' + coupon.id + '/usage',
          { headers: admin },
        )
      ).json(),
    ).toMatchObject({ activeClaims: 1 })
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: product.id },
    })
    expect(balance).toMatchObject({ onHand: 19, reservedQuantity: 0 })
    expect(
      (
        await request.post('/v1/checkout/estimate', {
          headers,
          data: {
            ...{ countryCode: f.countryCode, couponCode: coupon.code },
            items: f.selections(headers),
          },
        })
      ).status(),
    ).toBe(422)
    const another = await f.account('CUSTOMER')
    f.selectItems(bearer(another.token), { productId: product.id, quantity: 1 })
    expect(
      (
        await request.post('/v1/checkout/estimate', {
          headers: bearer(another.token),
          data: {
            ...{ countryCode: f.countryCode, couponCode: coupon.code },
            items: f.selections(bearer(another.token)),
          },
        })
      ).status(),
    ).toBe(200) // Per-customer restriction does not become an accidental global limit.
  } finally {
    await f.db.paymentWebhookReceipt.deleteMany({
      where: { providerEventId: eventId },
    })
    await f.close()
  }
})

test('promotions DB: competing discounted holds cannot oversell one SKU or leave a quota claim on the losing transaction', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    await f.rate()
    const owner = await f.account('OWNER')
    const product = await f.product(owner.token, 'scarce', 1299, 1)
    const coupon = await f.coupon(owner.token)
    const customers = await Promise.all([
      f.account('CUSTOMER'),
      f.account('CUSTOMER'),
    ])
    for (const customer of customers)
      f.selectItems(bearer(customer.token), {
        productId: product.id,
        quantity: 1,
      })
    const responses = await Promise.all(
      customers.map((customer) =>
        request.post('/v1/checkout/reservations', {
          headers: bearer(customer.token),
          data: {
            ...{
              requestId: randomUUID(),
              countryCode: f.countryCode,
              couponCode: coupon.code,
            },
            items: f.selections(bearer(customer.token)),
          },
        }),
      ),
    )
    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ])
    expect(
      await f.db.couponRedemption.count({ where: { couponId: coupon.id } }),
    ).toBe(1)
    expect(
      await f.db.inventoryBalance.findUnique({
        where: { productId: product.id },
      }),
    ).toMatchObject({
      onHand: 1,
      reservedQuantity: 1,
    })
  } finally {
    await f.close()
  }
})
