import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { assertSafeError, bearer } from './catalog-test-support'
import { couponInput, PromotionsFixture } from './promotions-test-support'

test('promotions security: every administrative route requires staff JWT and current marketing.manage; grants revoke without JWT refresh', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
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
    const id = randomUUID()
    for (const endpoint of ['coupons', 'campaigns']) {
      for (const [method, path] of [
        ['get', '/v1/admin/promotions/' + endpoint],
        ['post', '/v1/admin/promotions/' + endpoint],
        ['get', '/v1/admin/promotions/' + endpoint + '/' + id],
        ['put', '/v1/admin/promotions/' + endpoint + '/' + id],
        ['delete', '/v1/admin/promotions/' + endpoint + '/' + id],
      ] as const) {
        await assertSafeError(await request[method](path), 401)
        for (const actor of [customer, staff])
          await assertSafeError(
            await request[method](path, { headers: bearer(actor.token) }),
            403,
          )
      }
    }
    await assertSafeError(
      await request.get('/v1/admin/promotions/coupons/' + id + '/usage'),
      401,
    )
    await f.db.staffRolePermission.create({
      data: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    expect(
      (
        await request.get('/v1/admin/promotions/coupons', {
          headers: bearer(staff.token),
        })
      ).status(),
    ).toBe(200)
    await f.coupon(staff.token)
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'marketing.manage' },
    })
    await assertSafeError(
      await request.get('/v1/admin/promotions/coupons', {
        headers: bearer(staff.token),
      }),
      403,
    )
    await assertSafeError(
      await request.get('/v1/admin/promotions/coupons', {
        headers: { Authorization: 'Bearer invalid' },
      }),
      401,
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

test('promotions security: strict DTOs, UUID/revision bounds, forged totals/ledger fields and guest checkout are rejected without writes', async ({
  request,
}) => {
  const f = new PromotionsFixture(request)
  try {
    const owner = await f.account('OWNER'),
      customer = await f.account('CUSTOMER')
    const headers = bearer(owner.token)
    const before = await f.db.coupon.count()
    for (const bad of [
      { value: 10001 },
      { value: 0 },
      { kind: 'percent' },
      { currency: 'usd' },
      { minimumSubtotalMinor: -1 },
      { maximumDiscountMinor: 0 },
      { usageLimit: -1 },
      { code: '<script>' },
      { expectedRevision: 1 },
      { categoryId: randomUUID() },
      { startsAt: '2026-11-03T00:00:00Z', endsAt: '2026-11-02T00:00:00Z' },
      { startsAt: '2026-11-02' },
      { role: 'OWNER' },
      { redeemedCount: 0 },
    ])
      await assertSafeError(
        await request.post('/v1/admin/promotions/coupons', {
          headers,
          data: { ...couponInput(f.code()), ...bad },
        }),
        400,
      )
    expect(await f.db.coupon.count()).toBe(before)
    await assertSafeError(
      await request.get('/v1/admin/promotions/coupons/not-a-uuid', { headers }),
      400,
    )
    await assertSafeError(
      await request.delete('/v1/admin/promotions/coupons/' + randomUUID(), {
        headers,
        params: { expectedRevision: 2147483648 },
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/admin/promotions/coupons', {
        headers,
        params: { limit: 51 },
      }),
      400,
    )
    for (const path of ['/v1/checkout/estimate', '/v1/checkout/reservations']) {
      await assertSafeError(
        await request.post(path, {
          data: { countryCode: 'US', couponCode: 'SAVE10' },
        }),
        401,
      )
      for (const bad of [
        { discountMinor: 1 },
        { currency: 'USD' },
        { couponCode: null },
        { couponCode: ['SAVE10'] },
        { couponCodes: ['SAVE10', 'OTHER'] },
      ])
        await assertSafeError(
          await request.post(path, {
            headers: bearer(customer.token),
            data: {
              countryCode: 'US',
              ...(path.endsWith('reservations')
                ? { requestId: randomUUID() }
                : {}),
              ...bad,
            },
          }),
          400,
        )
    }
    await assertSafeError(
      await request.post('/v1/checkout/delivery-options', {
        headers: bearer(customer.token),
        data: { countryCode: 'US', discountMinor: 100 },
      }),
      400,
    )
  } finally {
    await f.close()
  }
})
