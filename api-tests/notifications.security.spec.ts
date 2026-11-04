import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  NotificationsFixture,
  preferenceInput,
} from './notifications-test-support'
import { assertSafeError, bearer } from './catalog-test-support'

test('G6 security: every notification API requires auth; template/failure control is OWNER-only (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  try {
    const customer = await f.account('CUSTOMER'),
      staff = await f.account('STAFF'),
      owner = await f.account('OWNER')
    for (const [method, route] of [
      ['get', '/v1/notifications'],
      ['get', '/v1/notifications/preferences'],
      ['put', '/v1/notifications/preferences'],
      ['put', '/v1/notifications/read-all'],
      ['put', '/v1/notifications/' + randomUUID() + '/read'],
      ['get', '/v1/notifications/' + randomUUID() + '/target'],
      ['get', '/v1/admin/notifications/templates'],
      ['put', '/v1/admin/notifications/templates/ORDER_PLACED'],
      ['get', '/v1/admin/notifications/failures'],
    ] as const)
      await assertSafeError(await request[method](route), 401)
    for (const actor of [customer, staff])
      for (const route of [
        '/v1/admin/notifications/templates',
        '/v1/admin/notifications/failures',
      ])
        await assertSafeError(
          await request.get(route, { headers: bearer(actor.token) }),
          403,
        )
    expect(
      (
        await request.get('/v1/admin/notifications/templates', {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(200)
    for (const data of [
      { ...preferenceInput, userId: owner.id },
      { ...preferenceInput, marketingConsentAt: new Date().toISOString() },
      { ...preferenceInput, transactionalEmail: null },
      { ...preferenceInput, securityEmailRequired: false },
    ])
      await assertSafeError(
        await request.put('/v1/notifications/preferences', {
          headers: bearer(customer.token),
          data,
        }),
        400,
      )
    for (const query of [
      'limit=51',
      'page=0',
      'readState=other',
      'userId=' + owner.id,
    ])
      await assertSafeError(
        await request.get('/v1/notifications?' + query, {
          headers: bearer(customer.token),
        }),
        400,
      )
    await assertSafeError(
      await request.put('/v1/notifications/' + randomUUID() + '/read', {
        headers: bearer(customer.token),
        data: { read: true, userId: owner.id },
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/notifications/not-a-uuid/target', {
        headers: bearer(customer.token),
      }),
      400,
    )
  } finally {
    await f.close()
  }
})

test('G6 security: current staff permission revocation hides persisted alerts and their targets (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  const where = {
    roleKey_permissionKey: {
      roleKey: 'SUPPORT',
      permissionKey: 'payments.view',
    },
  }
  const prior = await f.db.staffRolePermission.findUnique({ where })
  try {
    const staff = await f.account('STAFF')
    await f.db.staffRolePermission.upsert({
      where,
      create: { roleKey: 'SUPPORT', permissionKey: 'payments.view' },
      update: {},
    })
    const eventId = await f.event('payment.test_review_required', {
      providerEventId: 'evt_fixture_without_order',
    })
    await f.dispatcher().dispatch(f.since, 50, true)
    const data = await (
      await request.get('/v1/notifications', { headers: bearer(staff.token) })
    ).json()
    const row = data.items.find(
      (item: { kind: string }) => item.kind === 'PAYMENT_REVIEW',
    )
    expect(row).toBeTruthy()
    expect(
      (
        await request.get('/v1/notifications/' + row.id + '/target', {
          headers: bearer(staff.token),
        })
      ).status(),
    ).toBe(200)
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'payments.view' },
    })
    expect(
      await (
        await request.get('/v1/notifications', { headers: bearer(staff.token) })
      ).json(),
    ).toMatchObject({ total: 0, unread: 0 })
    await assertSafeError(
      await request.get('/v1/notifications/' + row.id + '/target', {
        headers: bearer(staff.token),
      }),
      404,
    )
    await assertSafeError(
      await request.put('/v1/notifications/' + row.id + '/read', {
        headers: bearer(staff.token),
        data: { read: true },
      }),
      404,
    )
    expect(await f.db.notification.count({ where: { eventId } })).toBe(1)
  } finally {
    if (prior)
      await f.db.staffRolePermission.upsert({
        where,
        create: prior,
        update: {},
      })
    else
      await f.db.staffRolePermission.deleteMany({
        where: { roleKey: 'SUPPORT', permissionKey: 'payments.view' },
      })
    await f.close()
  }
})

test('G6 security: template revision conflicts, plain text and placeholder validation (G12)', async ({
  request,
}) => {
  const f = new NotificationsFixture(request)
  const key = 'SECURITY_PASSWORD_CHANGED'
  const prior = await f.db.notificationTemplate.findUnique({ where: { key } })
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token),
      expectedRevision = prior?.revision ?? 0
    for (const body of ['<img src=x>', 'text\ncontrol', '{token}', '{orderId}'])
      await assertSafeError(
        await request.put('/v1/admin/notifications/templates/' + key, {
          headers,
          data: { expectedRevision, title: 'Security notice', body },
        }),
        400,
      )
    const value = {
      expectedRevision,
      title: 'Password changed safely',
      body: 'Your password was changed. Contact support if this was unexpected.',
    }
    expect(
      (
        await request.put('/v1/admin/notifications/templates/' + key, {
          headers,
          data: value,
        })
      ).status(),
    ).toBe(200)
    await assertSafeError(
      await request.put('/v1/admin/notifications/templates/' + key, {
        headers,
        data: value,
      }),
      409,
    )
    const user = await f.account('CUSTOMER')
    const id = await f.event('auth.password_changed', { userId: user.id })
    await f.dispatcher().dispatch(f.since, 50, true)
    expect(
      await f.db.notification.findFirst({ where: { eventId: id } }),
    ).toMatchObject({
      title: value.title,
      body: value.body,
      templateRevision: expectedRevision + 1,
    })
  } finally {
    if (prior)
      await f.db.notificationTemplate.upsert({
        where: { key },
        create: prior,
        update: prior,
      })
    else await f.db.notificationTemplate.deleteMany({ where: { key } })
    await f.close()
  }
})
