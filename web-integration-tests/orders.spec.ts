import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'

async function browserAccount(
  f: CatalogTestFixture,
  request: APIRequestContext,
  role: 'OWNER' | 'CUSTOMER',
) {
  const credentials = f.browserCredentials(),
    response = await request.post('/v1/auth/register', { data: credentials })
  expect(response.status()).toBe(201)
  const pair = await response.json()
  if (role === 'OWNER') {
    await f.db.user.update({ where: { id: pair.user.id }, data: { role } })
    const login = await request.post('/v1/admin/auth/login', {
      data: credentials,
    })
    expect(login.status()).toBe(200)
    return {
      ...credentials,
      id: pair.user.id as string,
      token: (await login.json()).accessToken as string,
    }
  }
  return {
    ...credentials,
    id: pair.user.id as string,
    token: pair.accessToken as string,
  }
}
async function login(
  page: Page,
  origin: string,
  credentials: { email: string; password: string },
  next: string,
) {
  await page.goto(origin + '/sign-in?next=' + encodeURIComponent(next))
  await page.getByLabel('Email', { exact: true }).fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(origin + next)
}
async function fixture(request: APIRequestContext) {
  const f = new CatalogTestFixture(request)
  let rateId = ''
  try {
    const owner = await browserAccount(f, request, 'OWNER'),
      customer = await browserAccount(f, request, 'CUSTOMER'),
      stranger = await f.account('CUSTOMER')
    let countryCode = ''
    for (const code of ['NR', 'NU', 'TV', 'TK', 'WF']) {
      if (
        !(await f.db.checkoutRate.count({
          where: { countryCode: code, currency: 'USD' },
        })) &&
        !(await f.db.deliveryZoneCountry.count({
          where: { countryCode: code, currency: 'USD' },
        }))
      ) {
        countryCode = code
        break
      }
    }
    if (!countryCode) throw new Error('No unused isolated shipping lane')
    const rate = await f.db.checkoutRate.create({
      data: {
        countryCode,
        currency: 'USD',
        shippingMinor: 100,
        taxBps: 0,
        enabled: true,
      },
    })
    rateId = rate.id
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Orders ' + f.key, slug: f.slug('cat') },
    })
    expect(category.status()).toBe(201)
    const created = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Recovery item ' + f.key,
        slug: f.slug('product'),
        sku: f.sku('product'),
        priceMinor: 1000,
        stockOnHand: 5,
        currency: 'USD',
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(created.status()).toBe(201)
    const product = await created.json(),
      auth = bearer(customer.token)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: auth,
          data: { productId: product.id, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers: auth,
      data: { requestId: randomUUID(), countryCode },
    })
    expect(hold.status()).toBe(200)
    const orderResponse = await request.post('/v1/orders', {
      headers: auth,
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: {
          recipientName: 'Owned Customer',
          phone: '+12025550123',
          addressLine1: '1 Fixture Street',
          city: 'City',
          countryCode,
        },
      },
    })
    expect(orderResponse.status()).toBe(200)
    const order = await orderResponse.json()
    // Controlled fixture only: construct a verified ledger and physical-sale snapshot.
    // This does not call a payment provider or certify real settlement.
    const intent = 'pi_WebOrders' + f.key + '12345'
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId: order.id,
        providerIntentId: intent,
        idempotencyKey: 'qa-weborders-' + f.key,
        status: 'SETTLED',
        amountMinor: order.totalMinor,
        currency: 'USD',
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId: order.id,
        paymentAttemptId: attempt.id,
        providerIntentId: intent,
        amountMinor: order.totalMinor,
        currency: 'USD',
      },
    })
    await f.db.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: product.id },
    })
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: 3, reservedQuantity: 0 },
    })
    await f.db.product.update({
      where: { id: product.id },
      data: { stockOnHand: 3 },
    })
    await f.db.inventoryMovement.create({
      data: {
        balanceId: balance.id,
        requestId: randomUUID(),
        reason: 'SALE',
        delta: -2,
        before: 5,
        after: 3,
        note: 'Controlled web order fixture sale',
      },
    })
    return {
      f,
      owner,
      customer,
      stranger,
      product,
      order,
      balanceId: balance.id,
      close: async () => {
        try {
          await f.db.checkoutRate.delete({ where: { id: rateId } })
        } finally {
          await f.close()
        }
      },
    }
  } catch (error) {
    if (rateId) await f.db.checkoutRate.delete({ where: { id: rateId } })
    await f.close()
    throw error
  }
}

test('cross-app order fulfillment, customer withdrawal/return, inspection/restock and same-SKU dispatch retain ownership and exactly-once stock', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const s = await fixture(request),
    errors: string[] = [],
    adminOrigin = 'http://127.0.0.1:3301',
    userOrigin = 'http://127.0.0.1:3300'
  const user = await page.context().newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  user.on('pageerror', (e) => errors.push(e.message))
  try {
    await login(page, adminOrigin, s.owner, '/orders?order=' + s.order.id)
    let lose = true
    await page.route(
      '**/v1/admin/orders/' + s.order.id + '/fulfillment/start',
      async (route) => {
        if (lose) {
          lose = false
          await route.fetch()
          await route.abort('failed')
        } else await route.continue()
      },
    )
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Start fulfillment', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Retry same order action', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Ship original order', exact: true }),
    ).toBeVisible()
    expect(
      await s.f.db.orderShipment.count({ where: { orderId: s.order.id } }),
    ).toBe(1)
    await page
      .getByLabel('Original shipment carrier', { exact: true })
      .fill('DHL')
    await page
      .getByLabel('Original shipment tracking number', { exact: true })
      .fill('ORIGINAL-' + s.f.key)
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Ship original order', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Mark original delivered', exact: true })
      .waitFor()
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Mark original delivered', exact: true })
      .click()
    await login(user, userOrigin, s.customer, '/account/orders/' + s.order.id)
    await expect(
      user.getByRole('heading', { name: 'Request a return', exact: true }),
    ).toBeVisible()
    await user
      .getByLabel('Order line', { exact: true })
      .selectOption(s.order.lines[0].id)
    await user.getByLabel('Return quantity', { exact: true }).fill('1')
    await user
      .getByRole('button', { name: 'Submit return request', exact: true })
      .click()
    await user
      .getByRole('button', { name: 'Withdraw return request', exact: true })
      .waitFor()
    user.once('dialog', (d) => d.accept())
    await user
      .getByRole('button', { name: 'Withdraw return request', exact: true })
      .click()
    await expect(
      user.getByRole('button', {
        name: 'Withdraw return request',
        exact: true,
      }),
    ).toHaveCount(0)
    await user
      .getByRole('button', { name: 'Submit return request', exact: true })
      .click()
    await expect(
      user.getByRole('button', {
        name: 'Withdraw return request',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Refresh selected order', exact: true })
      .click()
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Approve return', exact: true })
      .click()
    await page
      .getByLabel('Inspection condition', { exact: true })
      .selectOption('RESTOCKABLE')
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Record physical inspection', exact: true })
      .click()
    expect(
      (
        await s.f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: s.balanceId },
        })
      ).onHand,
    ).toBe(3)
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Restock original SKU', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Restock original SKU', exact: true }),
    ).toHaveCount(0)
    expect(
      (
        await s.f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: s.balanceId },
        })
      ).onHand,
    ).toBe(4)
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', {
        name: 'Authorize same-SKU replacement',
        exact: true,
      })
      .click()
    await page.getByLabel('Replacement carrier', { exact: true }).fill('UPS')
    await page
      .getByLabel('Replacement tracking number', { exact: true })
      .fill('REPLACEMENT-' + s.f.key)
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Ship same-SKU replacement', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Mark replacement delivered', exact: true })
      .waitFor()
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Mark replacement delivered', exact: true })
      .click()
    await expect(
      page.getByRole('button', {
        name: 'Mark replacement delivered',
        exact: true,
      }),
    ).toHaveCount(0)
    expect(
      (
        await s.f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: s.balanceId },
        })
      ).onHand,
    ).toBe(3)
    expect(
      await s.f.db.orderReplacement.count({ where: { orderId: s.order.id } }),
    ).toBe(1)
    await user.goto(userOrigin + '/track?order=' + s.order.id)
    await expect(
      user.getByText('REPLACEMENT-' + s.f.key, { exact: false }),
    ).toBeVisible()
    await user.reload()
    await expect(
      user.getByRole('heading', { name: 'Tracking timeline', exact: true }),
    ).toBeVisible()
    for (const suffix of ['', '/tracking', '/returns', '/replacements'])
      expect(
        (
          await request.get('/v1/orders/' + s.order.id + suffix, {
            headers: bearer(s.stranger.token),
          })
        ).status(),
      ).toBe(404)
    expect(
      (
        await request.get('/v1/payments/orders/' + s.order.id + '/refunds', {
          headers: bearer(s.stranger.token),
        })
      ).status(),
    ).toBe(404)
    await page
      .getByLabel('Refund amount (USD minor units)', { exact: true })
      .fill('100')
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Approve refund request', exact: true })
      .click()
    await expect(page.locator('main').getByRole('alert')).toBeVisible()
    expect(
      await s.f.db.refundRequest.count({ where: { orderId: s.order.id } }),
    ).toBe(0)
    await expect(
      page.getByText('Refund confirmed by the server.', { exact: true }),
    ).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await user.close()
    await s.close()
  }
})

test('OWNER refund approval survives lost acknowledgement without claiming provider success or returning stock', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const s = await fixture(request)
  try {
    await login(
      page,
      'http://127.0.0.1:3301',
      s.owner,
      '/orders?order=' + s.order.id,
    )
    let lose = true
    await page.route(
      '**/v1/admin/payments/orders/' + s.order.id + '/refunds',
      async (route) => {
        if (lose && route.request().method() === 'POST') {
          lose = false
          await route.fetch()
          await route.abort('failed')
        } else await route.continue()
      },
    )
    await page
      .getByLabel('Refund amount (USD minor units)', { exact: true })
      .fill('100')
    page.once('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Approve refund request', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Retry same order action', exact: true })
      .click()
    await expect(
      page.getByText('Refund not confirmed.', { exact: false }),
    ).toBeVisible()
    expect(
      await s.f.db.refundRequest.count({ where: { orderId: s.order.id } }),
    ).toBe(1)
    const row = await s.f.db.refundRequest.findFirstOrThrow({
      where: { orderId: s.order.id },
    })
    expect(row).toMatchObject({
      amountMinor: 100,
      status: 'REQUESTED',
      providerRefundId: null,
    })
    expect(
      (
        await s.f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: s.balanceId },
        })
      ).onHand,
    ).toBe(3)
    expect(
      (
        await request.get(
          '/v1/admin/payments/orders/' + s.order.id + '/refunds',
          {
            headers: bearer(s.customer.token),
          },
        )
      ).status(),
    ).toBe(403)
    await page.reload()
    await expect(
      page.getByText('Refund not confirmed.', { exact: false }),
    ).toBeVisible()
  } finally {
    await s.close()
  }
})
