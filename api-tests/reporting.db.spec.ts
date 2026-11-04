import type { DatabaseService } from '../src/database/database.service'
import { RefundLedgerService } from '../src/payments/refund-ledger.service'
import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'
import {
  ReportingFixture,
  bearer,
  expect,
  range,
} from './reporting-test-support'
const money = (
  value: {
    byCurrency: {
      currency: string
      paidMinor: string
      refundedMinor: string
      netCollectedMinor: string
      paidDiscountMinor: string
    }[]
  },
  currency: string,
) =>
  value.byCurrency.find((row) => row.currency === currency) ?? {
    paidMinor: '0',
    refundedMinor: '0',
    netCollectedMinor: '0',
    paidDiscountMinor: '0',
  }

test('G9 DB: verified collections, discount snapshots, currency separation and completed-refund event timing (G12)', async ({
  request,
}) => {
  test.setTimeout(90000)
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token),
      before = await (
        await request.get('/v1/admin/reports/financial', {
          headers,
          params: range,
        })
      ).json()
    const beforeRefundWindow = await (
      await request.get('/v1/admin/reports/financial', {
        headers,
        params: { from: '2001-01-02', to: '2001-01-03', currency: 'USD' },
      })
    ).json()
    const coupon = await f.coupon(owner.token),
      usd = await f.order(owner, 'USD', 1000, coupon.code),
      eur = await f.order(owner, 'EUR', 800)
    await f.settle(usd)
    await f.settle(eur)
    await f.refund(owner.id, usd.id, 100)
    await f.refund(owner.id, usd.id, 50, 'failed')
    await new RefundLedgerService({
      client: f.db,
    } as unknown as DatabaseService).create(owner.id, usd.id, {
      requestId: randomUUID(),
      amountMinor: 25,
      reason: 'OTHER',
    })
    const response = await request.get('/v1/admin/reports/financial', {
      headers,
      params: range,
    })
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('no-store')
    const after = await response.json(),
      b = money(before, 'USD'),
      a = money(after, 'USD')
    expect(BigInt(a.paidMinor) - BigInt(b.paidMinor)).toBe(
      BigInt(usd.totalMinor),
    )
    expect(BigInt(a.refundedMinor) - BigInt(b.refundedMinor)).toBe(100n)
    expect(BigInt(a.netCollectedMinor) - BigInt(b.netCollectedMinor)).toBe(
      BigInt(usd.totalMinor) - 100n,
    )
    expect(BigInt(a.paidDiscountMinor) - BigInt(b.paidDiscountMinor)).toBe(
      BigInt(usd.discountMinor),
    )
    expect(
      BigInt(money(after, 'EUR').paidMinor) -
        BigInt(money(before, 'EUR').paidMinor),
    ).toBe(BigInt(eur.totalMinor))
    const refundOnly = await (
      await request.get('/v1/admin/reports/financial', {
        headers,
        params: { from: '2001-01-02', to: '2001-01-03', currency: 'USD' },
      })
    ).json()
    expect(
      BigInt(money(refundOnly, 'USD').refundedMinor) -
        BigInt(money(beforeRefundWindow, 'USD').refundedMinor),
    ).toBe(100n)
    expect(money(refundOnly, 'USD').paidMinor).toBe(
      money(beforeRefundWindow, 'USD').paidMinor,
    )
    expect(
      BigInt(money(refundOnly, 'USD').netCollectedMinor) -
        BigInt(money(beforeRefundWindow, 'USD').netCollectedMinor),
    ).toBe(-100n)
    const series = await request.get('/v1/admin/reports/daily', {
      headers,
      params: { ...range, currency: 'USD' },
    })
    expect(series.status()).toBe(200)
    expect((await series.json()).items).toHaveLength(2)
    expect(JSON.stringify(after)).not.toMatch(
      /providerIntentId|passwordHash|shippingAddress|recipientName|email/,
    )
  } finally {
    await f.close()
  }
})

test('G9 DB: paid SKU snapshots survive catalog archive; customer and order/payment pages project only approved fields (G12)', async ({
  request,
}) => {
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token),
      order = await f.order(owner)
    await f.settle(order)
    await f.db.product.update({
      where: { id: order.productId },
      data: { title: 'Renamed after payment', status: 'ARCHIVED' },
    })
    const product = await request.get('/v1/admin/reports/products', {
      headers,
      params: { ...range, currency: 'USD', productId: order.productId },
    })
    expect(product.status()).toBe(200)
    expect(await product.json()).toMatchObject({
      total: 1,
      items: [
        {
          productId: order.productId,
          titleSnapshot: 'G9 Snapshot 0',
          unitsSold: '1',
          merchandiseGrossMinor: '1000',
          merchandiseNetMinor: '1000',
        },
      ],
    })
    const customers = await request.get('/v1/admin/reports/customers', {
      headers,
      params: { ...range, currency: 'USD', search: order.customer.email },
    })
    expect(customers.status()).toBe(200)
    expect(await customers.json()).toMatchObject({
      total: 1,
      items: [
        {
          id: order.customer.id,
          email: order.customer.email,
          paidOrderCount: 1,
          paidMinor: String(order.totalMinor),
        },
      ],
    })
    const payments = await request.get('/v1/admin/reports/payments', {
      headers,
      params: { ...range, currency: 'USD', status: 'SETTLED' },
    })
    expect(payments.status()).toBe(200)
    expect((await payments.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: order.id,
          attemptStatus: 'SETTLED',
          collectionState: 'PAID',
          settledMinor: order.totalMinor,
        }),
      ]),
    )
    const orders = await request.get('/v1/admin/reports/orders', {
      headers,
      params: { ...range, currency: 'USD', status: 'PAID' },
    })
    expect(orders.status()).toBe(200)
    expect((await orders.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: order.id,
          status: 'PAID',
          settledMinor: order.totalMinor,
          lifetimeRefundedMinor: '0',
        }),
      ]),
    )
    const text = JSON.stringify(await payments.json())
    expect(text).not.toMatch(
      /providerIntentId|idempotencyKey|paymentAttemptId|shippingAddress|optionsSnapshotJson/,
    )
  } finally {
    await f.close()
  }
})

test('G9 DB: current physical/held stock, threshold semantics and no parent-mirror double counting (G12)', async ({
  request,
}) => {
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      order = await f.order(owner),
      headers = bearer(owner.token)
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: order.productId },
    })
    const response = await request.get('/v1/admin/reports/inventory', {
      headers,
      params: { productId: order.productId },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      items: [
        {
          balanceId: balance.id,
          onHand: 20,
          reserved: 1,
          available: 19,
          lowStock: false,
        },
      ],
      totalsByCurrency: [
        {
          skuCount: 1,
          onHandUnits: '20',
          reservedUnits: '1',
          availableUnits: '19',
          retailOnHandMinor: '20000',
        },
      ],
    })
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { lowStockThreshold: 20 },
    })
    expect(
      await (
        await request.get('/v1/admin/reports/inventory', {
          headers,
          params: { productId: order.productId, lowStock: 'true' },
        })
      ).json(),
    ).toMatchObject({ total: 1, items: [{ lowStock: true, threshold: 20 }] })
    const other = await f.product(owner.token, 'variant-parent', 1000, 9)
    await f.db.product.update({
      where: { id: other.id },
      data: { hasVariants: true },
    })
    const hidden = await request.get('/v1/admin/reports/inventory', {
      headers,
      params: { productId: other.id },
    })
    expect(await hidden.json()).toMatchObject({ total: 0, items: [] })
  } finally {
    await f.close()
  }
})

test('G9 DB: audit filtering is literal, exports are formula-neutralized/audited and oversized export fails closed (G12)', async ({
  request,
}) => {
  const f = new ReportingFixture(request)
  try {
    const owner = await f.account('OWNER'),
      order = await f.order(owner),
      headers = bearer(owner.token)
    await f.settle(order)
    await f.db.user.update({
      where: { id: order.customer.id },
      data: { displayName: '=HYPERLINK("https://example.test")' },
    })
    const csv = await request.get('/v1/admin/reports/export/customers', {
      headers,
      params: { ...range, currency: 'USD', search: order.customer.email },
    })
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-type']).toContain('text/csv')
    expect(csv.headers()['content-disposition']).toContain(
      'attachment; filename="kookaburra-customers-',
    )
    expect(csv.headers()['x-export-row-count']).toBe('1')
    expect(await csv.text()).toContain(
      String.fromCharCode(34, 39) + '=HYPERLINK(',
    )
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'reports.export.prepared',
          targetId: 'customers',
        },
      }),
    ).toBe(1)
    await f.db.auditEvent.createMany({
      data: Array.from({ length: 1001 }, (_, i) => ({
        actorId: owner.id,
        action: i === 0 ? 'fixture.literal%_marker' : 'fixture.bulk.' + i,
        targetType: 'report_fixture',
        targetId: String(i),
        createdAt: new Date('2001-01-01T01:00:00Z'),
      })),
    })
    const activity = await request.get('/v1/admin/activity', {
      headers,
      params: { ...range, actorId: owner.id, search: '%_', limit: 10 },
    })
    expect(activity.status()).toBe(200)
    expect(await activity.json()).toMatchObject({
      total: 1,
      items: [
        { action: 'fixture.literal%_marker', targetType: 'report_fixture' },
      ],
    })
    const large = await request.get('/v1/admin/reports/export/activity', {
      headers,
      params: { ...range, actorId: owner.id },
    })
    expect(large.status()).toBe(400)
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'reports.export.prepared',
          targetId: 'activity',
        },
      }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
