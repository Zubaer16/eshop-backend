import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'

test('owner configures a real shipping lane and coupon; stale coupon edits fail without overwriting server rules', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request),
    credentials = f.browserCredentials()
  let rateId: string | undefined,
    fixtureCountry = ''
  try {
    const pair = await (
      await request.post('/v1/auth/register', { data: credentials })
    ).json()
    await f.db.user.update({
      where: { id: pair.user.id },
      data: { role: 'OWNER' },
    })
    const staff = await (
      await request.post('/v1/admin/auth/login', { data: credentials })
    ).json()
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
    fixtureCountry = countryCode
    await page.goto('http://127.0.0.1:3301/sign-in?next=%2Fshipping')
    await page.getByLabel('Email', { exact: true }).fill(credentials.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page
      .getByRole('button', { name: 'Configure country/tax lane', exact: true })
      .click()
    await page.getByLabel('ISO country code', { exact: true }).fill(countryCode)
    await page
      .getByLabel('Flat shipping (minor units)', { exact: true })
      .fill('150')
    await page.getByLabel('Tax basis points', { exact: true }).fill('750')
    await page
      .getByLabel('Enable this country/currency lane', { exact: true })
      .check()
    await page
      .getByRole('button', { name: 'Save configuration', exact: true })
      .click()
    await expect(
      page.getByRole('button', {
        name: 'Edit ' + countryCode + '/USD',
        exact: true,
      }),
    ).toBeVisible()
    const rate = await f.db.checkoutRate.findUniqueOrThrow({
      where: { countryCode_currency: { countryCode, currency: 'USD' } },
    })
    rateId = rate.id
    expect(rate).toMatchObject({
      taxBps: 750,
      shippingMinor: 150,
      freeOverSubtotalMinor: null,
      enabled: true,
    })
    await page.goto('http://127.0.0.1:3301/promotions')
    await page
      .getByRole('button', { name: 'Create coupon', exact: true })
      .click()
    const code = 'ADMIN-' + f.key.toUpperCase()
    await page.getByLabel('Coupon code', { exact: true }).fill(code)
    await page.getByLabel('Enable coupon', { exact: true }).check()
    await page
      .getByRole('button', { name: 'Save configuration', exact: true })
      .click()
    await page.getByLabel('Search coupons', { exact: true }).fill(code)
    await expect(
      page.getByRole('heading', { name: code + ' · revision 1', exact: true }),
    ).toBeVisible()
    const coupon = await f.db.coupon.findUniqueOrThrow({ where: { code } })
    await page
      .getByRole('button', { name: 'Edit current record', exact: true })
      .click()
    await expect(page.getByLabel('Coupon code', { exact: true })).toHaveValue(
      code,
    )
    expect(
      (
        await request.put('/v1/admin/promotions/coupons/' + coupon.id, {
          headers: bearer(staff.accessToken),
          data: {
            expectedRevision: 1,
            code,
            kind: 'PERCENT',
            value: 2000,
            currency: 'USD',
            minimumSubtotalMinor: 0,
            enabled: true,
          },
        })
      ).status(),
    ).toBe(200)
    await page
      .getByLabel('Value (1000 bps = 10%; fixed = minor units)', {
        exact: true,
      })
      .fill('500')
    await page
      .getByRole('button', { name: 'Save configuration', exact: true })
      .click()
    await expect(page.locator('main').getByRole('alert')).toHaveText(
      'Coupon changed. Reload and retry.',
    )
    await page
      .getByRole('button', {
        name: 'Close and refresh server records',
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('heading', { name: code + ' · revision 2', exact: true }),
    ).toBeVisible()
    expect(
      (await f.db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).value,
    ).toBe(2000)
    await page.goto('http://127.0.0.1:3301/payments')
    await expect(
      page.getByRole('heading', { name: 'TEST payment records', exact: true }),
    ).toBeVisible()
  } finally {
    // Recover own records even if an assertion fails immediately after acknowledgement.
    await f.db.coupon.deleteMany({
      where: { code: 'ADMIN-' + f.key.toUpperCase() },
    })
    if (rateId) await f.db.checkoutRate.delete({ where: { id: rateId } })
    else if (fixtureCountry)
      await f.db.checkoutRate.deleteMany({
        where: { countryCode: fixtureCountry, currency: 'USD' },
      })
    await f.close()
  }
})
test('browser-local checkout prices submitted items, reports stock shortages and restores owned holds', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request),
    errors: string[] = []
  let rateId: string | undefined, couponId: string | undefined
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    const owner = await f.account('OWNER'),
      other = await f.account('CUSTOMER'),
      credentials = f.browserCredentials()
    const registration = await request.post('/v1/auth/register', {
      data: credentials,
    })
    expect(registration.status()).toBe(201)
    const customer = await registration.json(),
      auth = bearer(customer.accessToken)
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
    if (!countryCode)
      throw new Error('No unused isolated test shipping lane is available')
    const rate = await request.put('/v1/admin/checkout/rates', {
      headers: bearer(owner.token),
      data: {
        countryCode,
        currency: 'USD',
        shippingMinor: 100,
        freeOverSubtotalMinor: null,
        taxBps: 1000,
        enabled: true,
      },
    })
    expect(rate.status()).toBe(200)
    rateId = (await rate.json()).id
    const code = 'WEB-' + f.key.toUpperCase()
    const coupon = await request.post('/v1/admin/promotions/coupons', {
      headers: bearer(owner.token),
      data: {
        expectedRevision: 0,
        code,
        kind: 'FIXED',
        value: 100,
        currency: 'USD',
        minimumSubtotalMinor: 0,
        enabled: true,
      },
    })
    expect(coupon.status()).toBe(201)
    couponId = (await coupon.json()).id
    const category = await (
      await request.post('/v1/admin/categories', {
        headers: bearer(owner.token),
        data: { name: 'Checkout ' + f.key, slug: f.slug('cat') },
      })
    ).json()
    const productResponse = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Checkout item ' + f.key,
        slug: f.slug('item'),
        sku: f.sku('item'),
        priceMinor: 1000,
        stockOnHand: 5,
        currency: 'USD',
        status: 'ACTIVE',
        categoryIds: [category.id],
      },
    })
    expect(productResponse.status()).toBe(201)
    const product = await productResponse.json()
    const lineId = randomUUID()
    const items = [
      { id: lineId, productId: product.id, variantId: null, quantity: 2 },
    ]
    await page.addInitScript(
      ({ userId, product, items }) => {
        const key = 'eshop-cart-v1:' + userId
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify({
              version: 1,
              cart: {
                cartId: null,
                currency: 'USD',
                subtotalMinor: 2000,
                amountDueMinor: null,
                checkoutReady: true,
                stockChecked: false,
                issues: [],
                quotedAt: new Date().toISOString(),
                items: items.map((item) => ({
                  ...item,
                  title: product.title,
                  sku: product.sku,
                  currency: 'USD',
                  unitPriceMinor: 1000,
                  lineTotalMinor: 2000,
                  availableQuantity: null,
                  status: 'AVAILABLE',
                })),
              },
            }),
          )
      },
      { userId: customer.user.id, product, items },
    )
    expect(
      (
        await request.post('/v1/account/addresses', {
          headers: auth,
          data: {
            label: 'Home',
            recipientName: 'Checkout Customer',
            phone: '+12025550123',
            addressLine1: '1 Test Road',
            city: 'City',
            countryCode,
          },
        })
      ).status(),
    ).toBe(201)
    await page.goto('http://127.0.0.1:3300/sign-in?next=%2Fcheckout')
    await page.getByLabel('Email', { exact: true }).fill(credentials.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Checkout', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Coupon code (optional)').fill(code)
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByLabel('Delivery service')).toContainText(
      'Legacy flat rate',
    )
    await expect(page.getByText('$21.90', { exact: true })).toBeVisible()
    const shortage = await request.post('/v1/checkout/reservations', {
      headers: auth,
      data: {
        requestId: randomUUID(),
        countryCode,
        couponCode: code,
        items: [{ ...items[0], quantity: 12 }],
      },
    })
    expect(shortage.status()).toBe(409)
    expect(await shortage.json()).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      items: [{ requestedQuantity: 12, availableQuantity: 5 }],
    })
    const held = await request.post('/v1/checkout/reservations', {
      headers: auth,
      data: { requestId: randomUUID(), countryCode, couponCode: code, items },
    })
    expect(held.status()).toBe(200)
    const hold = await held.json()
    expect(hold.estimatedTotalMinor).toBe(2190)
    expect(
      (
        await request.get('/v1/checkout/reservations/' + hold.id, {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
    await page.reload()
    await expect(
      page.getByRole('button', {
        name: 'Release previous stock hold',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Release previous stock hold', exact: true })
      .click()
    await expect(
      page.getByRole('button', {
        name: 'Continue to Stripe Checkout',
        exact: true,
      }),
    ).toBeEnabled()
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: product.id },
    })
    expect(balance).toMatchObject({ onHand: 5, reservedQuantity: 0 })
  } finally {
    if (couponId) {
      await f.db.couponRedemption.deleteMany({ where: { couponId } })
      await f.db.coupon.delete({ where: { id: couponId } })
    }
    if (rateId) await f.db.checkoutRate.delete({ where: { id: rateId } })
    await f.close()
  }
})
