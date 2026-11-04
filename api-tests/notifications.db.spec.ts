import { randomUUID } from 'node:crypto'
import { PromotionsFixture } from './promotions-test-support'
import { expect, test } from '@playwright/test'
import {
  NotificationsFixture,
  preferenceInput,
} from './notifications-test-support'
import { bearer } from './catalog-test-support'

test('G6 DB: independent subscription dedupe, concurrent workers, own inbox/read/target and no transport (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const owner = await f.account('OWNER'),
      first = await f.account('CUSTOMER'),
      second = await f.account('CUSTOMER')
    const id = await f.event(
      'auth.password_changed',
      { userId: first.id },
      'COMPLETED',
    )
    await Promise.all([
      f.dispatcher().dispatch(f.since, 50, true),
      f.dispatcher().dispatch(f.since, 50, true),
    ])
    expect(await f.db.notification.count({ where: { eventId: id } })).toBe(1)
    expect(await f.db.outboxEvent.findUnique({ where: { id } })).toMatchObject({
      status: 'COMPLETED',
      attempts: 0,
    })
    const home = await request.get('/v1/notifications', {
      headers: bearer(first.token),
    })
    expect(home.status()).toBe(200)
    const data = await home.json()
    expect(data).toMatchObject({
      unread: 1,
      total: 1,
      items: [
        {
          kind: 'SECURITY_PASSWORD_CHANGED',
          targetType: 'HOME',
          targetId: null,
        },
      ],
    })
    expect(JSON.stringify(data)).not.toMatch(
      /userId|eventId|payload|passwordHash|permissionKey|templateRevision/,
    )
    const item = data.items[0]
    expect(
      (
        await request.put('/v1/notifications/' + item.id + '/read', {
          headers: bearer(second.token),
          data: { read: true },
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.get('/v1/notifications/' + item.id + '/target', {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      await (
        await request.put('/v1/notifications/' + item.id + '/read', {
          headers: bearer(first.token),
          data: { read: true },
        })
      ).json(),
    ).toMatchObject({ readAt: expect.any(String) })
    expect(
      await (
        await request.get('/v1/notifications?readState=unread', {
          headers: bearer(first.token),
        })
      ).json(),
    ).toMatchObject({ unread: 0, total: 0 })
    expect(
      await (
        await request.put('/v1/notifications/' + item.id + '/read', {
          headers: bearer(first.token),
          data: { read: false },
        })
      ).json(),
    ).toMatchObject({ readAt: null })
    expect(
      await (
        await request.put('/v1/notifications/read-all', {
          headers: bearer(first.token),
          data: { before: new Date(Date.now() - 60000).toISOString() },
        })
      ).json(),
    ).toEqual({ changed: 0 })
    expect(
      await (
        await request.put('/v1/notifications/read-all', {
          headers: bearer(first.token),
          data: { before: new Date().toISOString() },
        })
      ).json(),
    ).toEqual({ changed: 1 })
    expect(
      await (
        await request.get('/v1/notifications/' + item.id + '/target', {
          headers: bearer(first.token),
        })
      ).json(),
    ).toEqual({ targetType: 'HOME', targetId: null })
  } finally {
    await f.close()
  }
})

test('G6 DB: defaults, distinct consent, mandatory security history and concurrent preference revisions (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      headers = bearer(user.token)
    expect(
      await (
        await request.get('/v1/notifications/preferences', { headers })
      ).json(),
    ).toMatchObject({
      revision: 0,
      marketingEmail: false,
      marketingPush: false,
      marketingInApp: false,
      marketingConsentAt: null,
      securityEmailRequired: true,
    })
    const writes = await Promise.all(
      [0, 1].map(() =>
        request.put('/v1/notifications/preferences', {
          headers,
          data: { ...preferenceInput, marketingEmail: true },
        }),
      ),
    )
    expect(writes.map((r) => r.status()).sort()).toEqual([200, 409])
    expect(
      await (
        await request.get('/v1/notifications/preferences', { headers })
      ).json(),
    ).toMatchObject({
      revision: 1,
      marketingEmail: true,
      marketingPush: false,
      marketingConsentAt: expect.any(String),
      transactionalEmail: false,
    })
    expect(
      await (
        await request.put('/v1/notifications/preferences', {
          headers,
          data: { ...preferenceInput, expectedRevision: 1 },
        })
      ).json(),
    ).toMatchObject({ revision: 2, marketingConsentAt: null })
    await f.event('auth.password_reset.completed', { userId: user.id })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(
      await (await request.get('/v1/notifications', { headers })).json(),
    ).toMatchObject({ total: 1, items: [{ kind: 'SECURITY_PASSWORD_RESET' }] })
  } finally {
    await f.close()
  }
})

test('G6 DB: failed event backoff, bounded safe failure visibility and no unverified payment success (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const owner = await f.account('OWNER')
    const id = await f.event('payment.test_settled', {
      orderId: '00000000-0000-4000-8000-000000000001',
      paymentTransactionId: '00000000-0000-4000-8000-000000000002',
    })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(await f.db.notification.count({ where: { eventId: id } })).toBe(0)
    expect(
      await f.db.notificationEventReceipt.findUnique({
        where: { eventId: id },
      }),
    ).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      failureCode: 'ORDER_NOT_FOUND',
    })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(
      (
        await f.db.notificationEventReceipt.findUniqueOrThrow({
          where: { eventId: id },
        })
      ).attempts,
    ).toBe(1)
    const failures = await request.get('/v1/admin/notifications/failures', {
      headers: bearer(owner.token),
    })
    expect(failures.status()).toBe(200)
    expect(await failures.json()).toContainEqual(
      expect.objectContaining({
        eventId: id,
        failureCode: 'ORDER_NOT_FOUND',
        exhausted: false,
      }),
    )
    expect(JSON.stringify(await failures.json())).not.toMatch(
      /payload|paymentTransactionId|stack|passwordHash/,
    )
    await f.db.notificationEventReceipt.update({
      where: { eventId: id },
      data: { attempts: 10, nextAttemptAt: new Date(0) },
    })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(
      (
        await f.db.notificationEventReceipt.findUniqueOrThrow({
          where: { eventId: id },
        })
      ).attempts,
    ).toBe(10)
  } finally {
    await f.close()
  }
})

test('G6 DB: atomic threshold crossing, rollback, dedupe and operational opt-out (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  let balanceId: string | undefined
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const cat = await request.post('/v1/admin/categories', {
      headers,
      data: { name: 'G6 Category', slug: f.slug('stock-category') },
    })
    expect(cat.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers,
      data: {
        title: 'G6 Stock',
        slug: f.slug('stock'),
        sku: f.sku('stock'),
        currency: 'USD',
        priceMinor: 1000,
        status: 'ACTIVE',
        stockOnHand: 10,
        categoryIds: [(await cat.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id
    balanceId = (
      await f.db.inventoryBalance.findUniqueOrThrow({ where: { productId } })
    ).id
    await expect(
      f.db.$transaction(async (tx) => {
        await tx.inventoryBalance.update({
          where: { id: balanceId! },
          data: { onHand: 1 },
        })
        throw new Error('rollback proof')
      }),
    ).rejects.toThrow('rollback proof')
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'inventory.low_stock',
          payload: { path: ['balanceId'], equals: balanceId },
        },
      }),
    ).toBe(0)
    const adjustment = {
      requestId: '1942ef6a-5484-439c-8af3-e3128faf4f68',
      reason: 'DAMAGE',
      delta: -6,
    }
    expect(
      (
        await request.post(
          '/v1/admin/inventory/' + balanceId + '/adjustments',
          { headers, data: adjustment },
        )
      ).status(),
    ).toBe(201)
    expect(
      (
        await request.post(
          '/v1/admin/inventory/' + balanceId + '/adjustments',
          { headers, data: adjustment },
        )
      ).status(),
    ).toBe(201)
    const events = await f.db.outboxEvent.findMany({
      where: {
        eventType: 'inventory.low_stock',
        payload: { path: ['balanceId'], equals: balanceId },
      },
    })
    f.eventIds.push(...events.map((row) => row.id))
    expect(events).toHaveLength(1)
    await f.dispatcher().dispatch(f.since, 50, true)
    const alert = await f.db.notification.findFirst({
      where: { eventId: events[0]!.id },
    })
    expect(alert).toMatchObject({
      kind: 'LOW_STOCK',
      audience: 'ADMIN',
      targetType: 'PRODUCT',
      targetId: productId,
    })
    expect(
      await f.db.notificationRecipient.count({
        where: { notificationId: alert!.id, userId: owner.id },
      }),
    ).toBe(1)
    await request.put('/v1/notifications/preferences', {
      headers,
      data: { ...preferenceInput, operationalInApp: false },
    })
    await f.db.inventoryBalance.update({
      where: { id: balanceId },
      data: { onHand: 10 },
    })
    await f.db.inventoryBalance.update({
      where: { id: balanceId },
      data: { onHand: 3 },
    })
    const next = await f.db.outboxEvent.findMany({
      where: {
        eventType: 'inventory.low_stock',
        payload: { path: ['balanceId'], equals: balanceId },
        id: { notIn: f.eventIds },
      },
    })
    f.eventIds.push(...next.map((row) => row.id))
    expect(next).toHaveLength(1)
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(
      await f.db.notificationRecipient.count({
        where: { userId: owner.id, notification: { eventId: next[0]!.id } },
      }),
    ).toBe(0)
  } finally {
    if (balanceId) {
      const events = await f.db.outboxEvent.findMany({
        where: {
          eventType: 'inventory.low_stock',
          payload: { path: ['balanceId'], equals: balanceId },
        },
        select: { id: true },
      })
      f.eventIds.push(...events.map((row) => row.id))
    }
    await f.close()
  }
})

test('G6 DB: real order authority, owned target and forged unpaid settlement rejection (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request),
    p = new PromotionsFixture(request)
  try {
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER'),
      other = await f.account('CUSTOMER')
    await p.rate()
    const product = await p.product(owner.token, 'notification-order', 1000, 20)
    const headers = bearer(customer.token)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers,
          data: { productId: product.id, quantity: 1 },
        })
      ).status(),
    ).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers,
      data: { requestId: randomUUID(), countryCode: p.countryCode },
    })
    expect(hold.status()).toBe(200)
    const orderResponse = await request.post('/v1/orders', {
      headers,
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: p.address(),
      },
    })
    expect(orderResponse.status()).toBe(200)
    const orderId = (await orderResponse.json()).id
    const created = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'order.created',
        payload: { path: ['orderId'], equals: orderId },
      },
    })
    f.eventIds.push(created.id)
    const forged = await f.event('payment.test_settled', {
      orderId,
      paymentTransactionId: randomUUID(),
      customerId: other.id,
    })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(await f.db.notification.count({ where: { eventId: forged } })).toBe(
      0,
    )
    expect(
      await f.db.notificationEventReceipt.findUnique({
        where: { eventId: forged },
      }),
    ).toMatchObject({ failureCode: 'SETTLEMENT_NOT_VERIFIED' })
    const inbox = await (
      await request.get('/v1/notifications', { headers })
    ).json()
    expect(inbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ORDER_PLACED', targetId: orderId }),
      ]),
    )
    const item = inbox.items.find(
      (row: { kind: string }) => row.kind === 'ORDER_PLACED',
    )
    expect(
      await (
        await request.get('/v1/notifications/' + item.id + '/target', {
          headers,
        })
      ).json(),
    ).toEqual({ targetType: 'ORDER', targetId: orderId })
    expect(
      (
        await request.get('/v1/notifications/' + item.id + '/target', {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
    const operational = await (
      await request.get('/v1/notifications', { headers: bearer(owner.token) })
    ).json()
    expect(operational.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ORDER_PLACED',
          audience: 'ADMIN',
          targetId: orderId,
          title: 'New order',
        }),
      ]),
    )
  } finally {
    try {
      await f.close()
    } finally {
      await p.close()
    }
  }
})
