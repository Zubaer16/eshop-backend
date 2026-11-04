import { test } from '@playwright/test'
import {
  ReportingFixture,
  bearer,
  expect,
  range,
} from './reporting-test-support'
import { assertSafeError } from './catalog-test-support'
const reportPaths = [
  '/v1/admin/reports/financial',
  '/v1/admin/reports/daily',
  '/v1/admin/reports/orders',
  '/v1/admin/reports/payments',
  '/v1/admin/reports/products',
  '/v1/admin/reports/customers',
  '/v1/admin/reports/inventory',
  '/v1/admin/activity',
  '/v1/admin/dashboard/overview',
]
test('G9 security: every report/export requires staff auth; granular grants are current and dashboard sections fail closed (G12)', async ({
  request,
}) => {
  const f = new ReportingFixture(request),
    prior = await f.db.staffRolePermission.findMany({
      where: { roleKey: 'SUPPORT' },
    })
  try {
    const owner = await f.account('OWNER'),
      staff = await f.account('STAFF'),
      customer = await f.account('CUSTOMER')
    for (const path of [
      ...reportPaths,
      ...[
        'sales',
        'orders',
        'payments',
        'products',
        'customers',
        'inventory',
        'activity',
      ].map((kind) => '/v1/admin/reports/export/' + kind),
    ]) {
      await assertSafeError(await request.get(path), 401)
      await assertSafeError(
        await request.get(path, {
          headers: bearer(customer.token),
          params: { currency: 'USD' },
        }),
        403,
      )
    }
    await f.db.staffRolePermission.deleteMany({ where: { roleKey: 'SUPPORT' } })
    await f.db.staffRolePermission.create({
      data: { roleKey: 'SUPPORT', permissionKey: 'dashboard.view' },
    })
    const headers = bearer(staff.token),
      overview = await request.get('/v1/admin/dashboard/overview', {
        headers,
        params: range,
      })
    expect(overview.status()).toBe(200)
    expect(await overview.json()).toMatchObject({
      available: {
        financial: false,
        orders: false,
        inventory: false,
        catalog: false,
        customers: false,
      },
      financial: null,
      recentOrders: null,
      inventory: null,
      products: null,
      activeProducts: null,
      customers: null,
    })
    for (const path of reportPaths.filter((p) => !p.endsWith('/overview')))
      await assertSafeError(
        await request.get(path, {
          headers,
          params: { ...range, currency: 'USD' },
        }),
        403,
      )
    await f.db.staffRolePermission.create({
      data: { roleKey: 'SUPPORT', permissionKey: 'payments.view' },
    })
    expect(
      (
        await request.get('/v1/admin/reports/financial', {
          headers,
          params: range,
        })
      ).status(),
    ).toBe(200)
    expect(
      await (
        await request.get('/v1/admin/dashboard/overview', {
          headers,
          params: range,
        })
      ).json(),
    ).toMatchObject({
      available: { financial: true, catalog: false, customers: false },
      recentOrders: null,
    })
    for (const kind of [
      'products',
      'customers',
      'inventory',
      'activity',
      'orders',
    ])
      await assertSafeError(
        await request.get('/v1/admin/reports/export/' + kind, {
          headers,
          params: { ...range, currency: 'USD' },
        }),
        403,
      )
    await f.db.staffRolePermission.deleteMany({
      where: { roleKey: 'SUPPORT', permissionKey: 'payments.view' },
    })
    await assertSafeError(
      await request.get('/v1/admin/reports/financial', {
        headers,
        params: range,
      }),
      403,
    )
    expect(
      (
        await request.get('/v1/admin/reports/financial', {
          headers: bearer(owner.token),
          params: range,
        })
      ).status(),
    ).toBe(200)
  } finally {
    await f.db.staffRolePermission.deleteMany({ where: { roleKey: 'SUPPORT' } })
    if (prior.length) await f.db.staffRolePermission.createMany({ data: prior })
    await f.close()
  }
})
test('G9 security: ranges, filters, currency, query injection and export bounds are validated without secret projections (G12)', async ({
  request,
}) => {
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    for (const params of [
      { from: '2026-11-01' },
      { from: '2026-02-29', to: '2026-03-01' },
      { from: '2026-11-02', to: '2026-11-02' },
      { from: '2024-01-01', to: '2026-01-01' },
      { currency: 'usd' },
      { currency: "USD' OR 1=1 --" },
      { userId: owner.id },
    ] as Record<string, string | number | boolean>[])
      await assertSafeError(
        await request.get('/v1/admin/reports/financial', { headers, params }),
        400,
      )
    for (const path of ['daily', 'products', 'customers'])
      await assertSafeError(
        await request.get('/v1/admin/reports/' + path, {
          headers,
          params: range,
        }),
        400,
      )
    for (const params of [
      { limit: 101 },
      { page: 0 },
      { status: 'REFUNDED' },
      { from: 'bad', to: '2026-11-03' },
    ] as Record<string, string | number | boolean>[])
      await assertSafeError(
        await request.get('/v1/admin/reports/orders', { headers, params }),
        400,
      )
    for (const params of [
      { filename: 'evil.csv' },
      { limit: 100000 },
      { currency: 'USD', status: 'PAID' },
    ] as Record<string, string | number | boolean>[])
      await assertSafeError(
        await request.get('/v1/admin/reports/export/sales', {
          headers,
          params: { ...range, ...params },
        }),
        400,
      )
    await assertSafeError(
      await request.get('/v1/admin/reports/export/unknown', { headers }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/admin/reports/export/inventory', {
        headers,
        params: range,
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/admin/activity', {
        headers,
        params: { ...range, search: 'bad\u0000term' },
      }),
      400,
    )
    const response = await request.get('/v1/admin/activity', {
      headers,
      params: { ...range, limit: 1 },
    })
    expect(response.status()).toBe(200)
    expect(JSON.stringify(await response.json())).not.toMatch(
      /passwordHash|tokenCiphertext|providerIntentId|DATABASE_URL|shippingAddress/,
    )
  } finally {
    await f.close()
  }
})
