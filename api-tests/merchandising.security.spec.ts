import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { assertSafeError, bearer } from './catalog-test-support'
import { bannerInput, MerchandisingFixture } from './merchandising-test-support'

test('G5 security: all content routes require current marketing.manage or OWNER; revoke is immediate (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  const where = {
    roleKey_permissionKey: {
      roleKey: 'SUPPORT',
      permissionKey: 'marketing.manage',
    },
  }
  const prior = await f.db.staffRolePermission.findUnique({ where })
  try {
    const customer = await f.account('CUSTOMER'),
      staff = await f.account('STAFF')
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    for (const entity of ['banners', 'collections'])
      for (const [method, path] of [
        ['get', '/v1/admin/store/' + entity],
        ['post', '/v1/admin/store/' + entity],
        ['get', '/v1/admin/store/' + entity + '/' + randomUUID()],
        ['put', '/v1/admin/store/' + entity + '/' + randomUUID()],
        ['delete', '/v1/admin/store/' + entity + '/' + randomUUID()],
      ] as const) {
        await assertSafeError(await request[method](path), 401)
        for (const actor of [customer, staff])
          await assertSafeError(
            await request[method](path, { headers: bearer(actor.token) }),
            403,
          )
      }
    await f.db.staffRolePermission.create({
      data: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    await f.banner(staff.token) // Content permission does not grant raw media-upload/catalog permissions.
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    await assertSafeError(
      await request.get('/v1/admin/store/banners', {
        headers: bearer(staff.token),
      }),
      403,
    )
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

test('G5 security: unsafe links/raw URLs/markup/window/ID/field injection rejected without content writes (G12)', async ({
  request,
}) => {
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const before = await f.db.storeBanner.count()
    for (const bad of [
      { ctaHref: '//evil.test' },
      { ctaHref: '/%2f%2fevil.test' },
      { ctaHref: '/%252f%252fevil.test' },
      { ctaHref: '/shop/../sign-in' },
      { ctaHref: '/sign-in?next=evil' },
      { ctaHref: '/shop?redirect=evil' },
      { imageUrl: 'https://untrusted.test/a.png' },
      { headline: '<script>' },
      { headline: 'Valid\n' },
      { imageMediaId: 'fixture-id' },
      { slot: 'builder' },
      { role: 'OWNER' },
      { startsAt: '2026-11-03T00:00:00Z', endsAt: '2026-11-02T00:00:00Z' },
      { position: 100 },
    ])
      await assertSafeError(
        await request.post('/v1/admin/store/banners', {
          headers,
          data: { ...bannerInput, ...bad },
        }),
        400,
      )
    expect(await f.db.storeBanner.count()).toBe(before)
    const foreign = await f.asset({
      namespace: 'foreign/namespace',
      objectKey: 'foreign/namespace/' + randomUUID(),
    })
    const pending = await f.asset({
      status: 'PENDING_UPLOAD',
      providerAssetId: null,
    })
    for (const imageMediaId of [foreign, pending, randomUUID()])
      await assertSafeError(
        await request.post('/v1/admin/store/banners', {
          headers,
          data: { ...bannerInput, imageMediaId, imageAlt: 'Image' },
        }),
        409,
      )
    await assertSafeError(
      await request.get('/v1/admin/store/banners/not-a-uuid', { headers }),
      400,
    )
    await assertSafeError(
      await request.delete('/v1/admin/store/banners/' + randomUUID(), {
        headers,
        params: { expectedRevision: 2147483648 },
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/admin/store/collections', {
        headers,
        params: { limit: 51 },
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/store/collections/not_valid'),
      400,
    )
    expect(await f.db.storeBanner.count()).toBe(before)
  } finally {
    await f.close()
  }
})
