import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'
import { PushFixture, bearer, expect } from './push-test-support'
import { assertSafeError } from './catalog-test-support'

test('push messaging security: registration is authenticated, ownership-bound, redacted and isolated by surface/project (release acceptance)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const first = await f.account('CUSTOMER'),
      second = await f.account('CUSTOMER'),
      device = await f.device(first)
    for (const [method, path] of [
      ['get', '/v1/notifications/push/config'],
      ['get', '/v1/notifications/push/devices'],
      ['post', '/v1/notifications/push/devices'],
      ['delete', '/v1/notifications/push/devices/' + device.id],
      ['get', '/v1/notifications/push/deliveries/' + randomUUID() + '/target'],
    ] as const)
      await assertSafeError(await request[method](path), 401)
    await assertSafeError(
      await request.delete('/v1/notifications/push/devices/' + device.id, {
        headers: bearer(second.token),
        params: { expectedRevision: 1 },
      }),
      404,
    )
    const input = {
      expectedRevision: 0,
      installationId: randomUUID(),
      surface: 'STOREFRONT',
      token: device.rawToken,
      permission: 'GRANTED',
    }
    await assertSafeError(
      await request.post('/v1/notifications/push/devices', {
        headers: bearer(second.token),
        data: input,
      }),
      409,
    )
    await assertSafeError(
      await request.post('/v1/notifications/push/devices', {
        headers: bearer(first.token),
        data: { ...input, surface: 'ADMIN' },
      }),
      403,
    )
    for (const bad of [
      { userId: second.id },
      { projectId: 'foreign-project' },
      { status: 'ACTIVE' },
      { permission: 'DENIED' },
      { token: 'token\nwith-control' },
      { platform: 'FLUTTER' },
    ])
      await assertSafeError(
        await request.post('/v1/notifications/push/devices', {
          headers: bearer(first.token),
          data: { ...input, token: 'different-token-' + randomUUID(), ...bad },
        }),
        400,
      )
    const metadata = await (
      await request.get('/v1/notifications/push/config', {
        headers: bearer(first.token),
      })
    ).json()
    expect(metadata).toMatchObject({
      mode: 'disabled',
      platform: 'WEB',
      providerVerified: false,
    })
    expect(JSON.stringify(metadata)).not.toMatch(
      /privateKey|clientEmail|encryptionKey|registrationToken/,
    )
  } finally {
    await f.close()
  }
})

test('push messaging security: current marketing grant controls campaigns; OWNER alone approves and sees provider history (release acceptance)', async ({
  request,
}) => {
  const f = new PushFixture(request),
    where = {
      roleKey_permissionKey: {
        roleKey: 'SUPPORT',
        permissionKey: 'marketing.manage',
      },
    },
    prior = await f.db.staffRolePermission.findUnique({ where })
  try {
    const staff = await f.account('STAFF'),
      customer = await f.account('CUSTOMER'),
      owner = await f.account('OWNER')
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    for (const route of [
      '/v1/admin/push/campaigns',
      '/v1/admin/push/status',
      '/v1/admin/push/deliveries',
      '/v1/admin/push/planning-failures',
    ]) {
      await assertSafeError(await request.get(route), 401)
      for (const actor of [staff, customer])
        await assertSafeError(
          await request.get(route, { headers: bearer(actor.token) }),
          403,
        )
    }
    await f.db.staffRolePermission.create({
      data: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    const campaign = await f.campaign(staff)
    await assertSafeError(
      await request.post(
        '/v1/admin/push/campaigns/' + campaign.id + '/approve',
        { headers: bearer(staff.token), data: { expectedRevision: 1 } },
      ),
      403,
    )
    expect(
      (
        await request.get(
          '/v1/admin/push/campaigns/' + campaign.id + '/preview',
          { headers: bearer(staff.token) },
        )
      ).status(),
    ).toBe(200)
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    await assertSafeError(
      await request.get('/v1/admin/push/campaigns/' + campaign.id, {
        headers: bearer(staff.token),
      }),
      403,
    )
    expect(
      (
        await request.get('/v1/admin/push/status', {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(200)
  } finally {
    if (prior)
      await f.db.staffRolePermission.upsert({
        where,
        create: prior,
        update: {},
      })
    else
      await f.db.staffRolePermission.deleteMany({
        where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
      })
    await f.close()
  }
})

test('push messaging security: campaigns reject raw redirects/media/markup, private-wide targets and invalid audiences (release acceptance)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token),
      base = {
        expectedRevision: 0,
        title: 'push messaging Promotion',
        body: 'Curated picks',
        audience: 'ALL_OPTED_IN_CUSTOMERS',
        targetType: 'HOME',
        targetId: null,
        imageMediaId: null,
      }
    for (const bad of [
      { title: '<script>' },
      { body: 'bad\r\ntext' },
      { targetType: 'ORDER', targetId: randomUUID() },
      { targetUrl: 'https://evil.test' },
      { imageUrl: 'https://evil.test/x.png' },
      { audience: 'ALL_USERS' },
      { status: 'SCHEDULED' },
      { approvedById: owner.id },
    ])
      await assertSafeError(
        await request.post('/v1/admin/push/campaigns', {
          headers,
          data: { ...base, ...bad },
        }),
        400,
      )
    await assertSafeError(
      await request.post('/v1/admin/push/campaigns', {
        headers,
        data: { ...base, selectedUserIds: [owner.id] },
      }),
      409,
    )
    await assertSafeError(
      await request.post('/v1/admin/push/campaigns', {
        headers,
        data: {
          ...base,
          audience: 'SELECTED_CUSTOMERS',
          selectedUserIds: [owner.id],
        },
      }),
      409,
    )
    await assertSafeError(
      await request.post('/v1/admin/push/campaigns', {
        headers,
        data: { ...base, targetType: 'PRODUCT', targetId: randomUUID() },
      }),
      404,
    )
    const mediaId = await f.asset({
      namespace: 'foreign/namespace',
      objectKey: 'foreign/namespace/' + randomUUID(),
    })
    await assertSafeError(
      await request.post('/v1/admin/push/campaigns', {
        headers,
        data: { ...base, imageMediaId: mediaId },
      }),
      409,
    )
    await assertSafeError(
      await request.get('/v1/admin/push/campaigns?limit=51', { headers }),
      400,
    )
    expect(
      await f.db.pushCampaign.count({ where: { title: base.title } }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})

test('push messaging security: active device cap cannot be bypassed by reactivating an eleventh revoked installation (release acceptance)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      first = await f.device(user)
    await request.delete('/v1/notifications/push/devices/' + first.id, {
      headers: bearer(user.token),
      params: { expectedRevision: 1 },
    })
    for (let i = 0; i < 10; i++) await f.device(user)
    const data = {
      expectedRevision: 2,
      installationId: first.installationId,
      surface: 'STOREFRONT',
      token: first.rawToken,
      permission: 'GRANTED',
    }
    await assertSafeError(
      await request.post('/v1/notifications/push/devices', {
        headers: bearer(user.token),
        data,
      }),
      409,
    )
    expect(
      await f.db.pushDevice.count({
        where: { userId: user.id, status: 'ACTIVE' },
      }),
    ).toBe(10)
  } finally {
    await f.close()
  }
})
