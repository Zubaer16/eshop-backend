import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { NotificationsFixture } from './notifications-test-support'
import { bearer } from './catalog-test-support'
import { hashPassword } from '../src/auth/credentials/password'
import { PromotionsFixture } from './promotions-test-support'

test('immediate actions DB: HTTP commit dispatches its security event without draining unrelated events', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const user = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const unrelated = await f.event('auth.password_changed', {
      userId: other.id,
    })
    const password = `Original-${randomUUID()}-Aa1!`
    await f.db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    })
    const response = await request.post('/v1/auth/change-password', {
      headers: bearer(user.token),
      data: {
        currentPassword: password,
        newPassword: `Changed-${randomUUID()}-Aa1!`,
      },
    })
    expect(response.status()).toBe(200)
    const event = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'auth.password_changed',
        payload: { path: ['userId'], equals: user.id },
      },
    })
    await expect
      .poll(
        async () =>
          (
            await f.db.notificationEventReceipt.findUnique({
              where: { eventId: event.id },
            })
          )?.status,
      )
      .toBe('COMPLETED')
    expect(
      await f.db.notification.count({ where: { eventId: event.id } }),
    ).toBe(1)
    expect(
      await f.db.notificationEventReceipt.findUnique({
        where: { eventId: unrelated },
      }),
    ).toBeNull()
    expect(
      await f.db.emailDelivery.count({ where: { eventId: event.id } }),
    ).toBe(0)
    expect(
      await f.db.pushDelivery.count({ where: { eventId: event.id } }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})

test('immediate actions DB: stock adjustment dispatches its PostgreSQL-triggered event', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const owner = await f.account('OWNER')
    const headers = bearer(owner.token)
    const category = await request.post('/v1/admin/categories', {
      headers,
      data: { name: 'Immediate stock', slug: f.slug('category') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers,
      data: {
        title: 'Immediate stock',
        slug: f.slug('product'),
        sku: f.sku('product'),
        currency: 'USD',
        priceMinor: 1000,
        status: 'ACTIVE',
        stockOnHand: 10,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: (await product.json()).id },
    })
    const adjusted = await request.post(
      `/v1/admin/inventory/${balance.id}/adjustments`,
      {
        headers,
        data: { requestId: randomUUID(), reason: 'DAMAGE', delta: -6 },
      },
    )
    expect(adjusted.status()).toBe(201)
    const event = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'inventory.low_stock',
        payload: { path: ['balanceId'], equals: balance.id },
      },
    })
    f.eventIds.push(event.id)
    await expect
      .poll(
        async () =>
          (
            await f.db.notificationEventReceipt.findUnique({
              where: { eventId: event.id },
            })
          )?.status,
      )
      .toBe('COMPLETED')
    expect(
      await f.db.notification.count({ where: { eventId: event.id } }),
    ).toBe(1)
  } finally {
    await f.close()
  }
})

test('immediate actions DB: checkout shortage recovers related expired holds and eligible unpaid orders', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    const owner = await f.account('OWNER')
    const ordered = await f.account('CUSTOMER')
    const held = await f.account('CUSTOMER')
    const buyer = await f.account('CUSTOMER')
    const unrelated = await f.account('CUSTOMER')
    await f.rate()
    const product = await f.product(owner.token, 'expired-stock', 1000, 4)
    const otherProduct = await f.product(
      owner.token,
      'other-expired-stock',
      1000,
      2,
    )
    const reserve = async (
      token: string,
      productId: string,
      quantity: number,
    ) => {
      const response = await request.post('/v1/checkout/reservations', {
        headers: bearer(token),
        data: {
          requestId: randomUUID(),
          countryCode: f.countryCode,
          items: [{ id: randomUUID(), productId, variantId: null, quantity }],
        },
      })
      expect(response.status()).toBe(200)
      return response.json()
    }
    const allocated = await reserve(ordered.token, product.id, 2)
    const orderResponse = await request.post('/v1/orders', {
      headers: bearer(ordered.token),
      data: {
        requestId: randomUUID(),
        reservationId: allocated.id,
        shippingAddress: {
          recipientName: 'QA Buyer',
          phone: '+12025550123',
          addressLine1: '1 Test Street',
          city: 'Example',
          postalCode: '10001',
          countryCode: f.countryCode,
        },
      },
    })
    expect(orderResponse.status()).toBe(200)
    const order = await orderResponse.json()
    const hold = await reserve(held.token, product.id, 2)
    const otherHold = await reserve(unrelated.token, otherProduct.id, 2)
    const past = new Date(Date.now() - 60_000)
    await f.db.order.update({
      where: { id: order.id },
      data: { paymentDeadlineAt: past },
    })
    await f.db.checkoutReservation.updateMany({
      where: { id: { in: [hold.id, otherHold.id] } },
      data: { expiresAt: past },
    })

    const next = await reserve(buyer.token, product.id, 4)
    expect(next.status).toBe('ACTIVE')
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('EXPIRED')
    expect(
      (
        await f.db.checkoutReservation.findUniqueOrThrow({
          where: { id: hold.id },
        })
      ).status,
    ).toBe('EXPIRED')
    expect(
      (
        await f.db.checkoutReservation.findUniqueOrThrow({
          where: { id: otherHold.id },
        })
      ).status,
    ).toBe('ACTIVE')
    expect(
      await f.db.inventoryBalance.findUniqueOrThrow({
        where: { productId: product.id },
      }),
    ).toMatchObject({ onHand: 4, reservedQuantity: 4 })
  } finally {
    await f.close()
  }
})
