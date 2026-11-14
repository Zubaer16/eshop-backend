import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
const userOrigin = 'http://127.0.0.1:3300',
  adminOrigin = 'http://127.0.0.1:3301'
async function register(
  f: CatalogTestFixture,
  request: APIRequestContext,
  role: 'CUSTOMER' | 'OWNER' = 'CUSTOMER',
) {
  const credentials = f.browserCredentials(),
    response = await request.post('/v1/auth/register', { data: credentials })
  expect(response.status()).toBe(201)
  const pair = await response.json()
  await request.post('/v1/auth/logout', {
    data: { refreshToken: pair.refreshToken },
  })
  if (role !== 'CUSTOMER')
    await f.db.user.update({ where: { id: pair.user.id }, data: { role } })
  return { ...credentials, id: pair.user.id as string }
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
test('local guest cart persists, merges explicitly on login and remains isolated across accounts', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request)
  const cartRequests: string[] = []
  page.on('request', (request) => {
    if (/\/(?:v1\/(?:cart|guest-cart)|api\/cart)(?:[/?]|$)/.test(request.url()))
      cartRequests.push(request.url())
  })
  try {
    const owner = await f.account('OWNER'),
      customer = await register(f, request),
      other = await register(f, request)
    const category = await (
      await request.post('/v1/admin/categories', {
        headers: bearer(owner.token),
        data: { name: 'Local cart', slug: f.slug('shop') },
      })
    ).json()
    const product = await (
      await request.post('/v1/admin/products', {
        headers: bearer(owner.token),
        data: {
          title: 'Local Item ' + f.key,
          slug: f.slug('item'),
          sku: f.sku('item'),
          priceMinor: 125,
          stockOnHand: 10,
          status: 'ACTIVE',
          categoryIds: [category.id],
        },
      })
    ).json()
    await page.goto(userOrigin + '/product/' + product.slug)
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText(product.title)
    await page
      .getByRole('link', { name: 'Open full cart', exact: true })
      .click()
    await page
      .getByLabel('Quantity for ' + product.sku, { exact: true })
      .fill('12')
    await page.reload()
    await expect(
      page.getByLabel('Quantity for ' + product.sku, { exact: true }),
    ).toHaveValue('12')
    await login(page, userOrigin, customer, '/cart')
    await page
      .getByRole('button', { name: 'Merge guest cart', exact: true })
      .click()
    await expect(
      page.getByLabel('Quantity for ' + product.sku, { exact: true }),
    ).toHaveValue('12')
    await expect(
      page.getByRole('heading', { name: 'Guest items waiting to merge' }),
    ).toHaveCount(0)
    await page.goto(userOrigin + '/account')
    const loggedOut = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/session' &&
        response.request().postDataJSON()?.action === 'logout',
    )
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await (await loggedOut).finished()
    await login(page, userOrigin, other, '/cart')
    await expect(
      page.getByRole('heading', { name: 'Your cart is empty', exact: true }),
    ).toBeVisible()
    expect(cartRequests).toEqual([])
  } finally {
    await f.close()
  }
})

test('profile/address editing respects ownership and admin customer directory reveals no address contents or invented spend', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const customer = await register(f, request),
      owner = await register(f, request, 'OWNER'),
      outsider = await f.account('CUSTOMER')
    await login(page, userOrigin, customer, '/account')
    await page
      .getByLabel('Display name', { exact: true })
      .fill('Current Customer ' + f.key)
    await page
      .getByRole('button', { name: 'Save display name', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Display name saved.' }),
    ).toHaveText('Display name saved.')
    await page
      .getByRole('link', { name: 'Saved addresses', exact: true })
      .click()
    await page.getByRole('button', { name: 'Add address', exact: true }).click()
    await page
      .getByLabel('Recipient name', { exact: true })
      .fill('Controlled Recipient')
    await page.getByLabel('Phone (E.164)', { exact: true }).fill('+12025550123')
    const street = 'Private street ' + f.key
    await page.getByLabel('Street address', { exact: true }).fill(street)
    await page.getByLabel('City', { exact: true }).fill('Controlled City')
    await page.getByLabel('Country code (ISO)', { exact: true }).fill('US')
    await page
      .getByRole('button', { name: 'Save address', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Home · Default', exact: true }),
    ).toBeVisible()
    const address = await f.db.customerAddress.findFirstOrThrow({
      where: { userId: customer.id },
    })
    expect(
      (
        await request.get('/v1/account/addresses/' + address.id, {
          headers: bearer(outsider.token),
        })
      ).status(),
    ).toBe(404)
    await page
      .getByRole('button', { name: 'Edit address', exact: true })
      .click()
    await page.getByLabel('City', { exact: true }).fill('Updated City')
    await page
      .getByRole('button', { name: 'Save address', exact: true })
      .click()
    await expect(
      page.locator('article').filter({ hasText: street }),
    ).toContainText('Updated City')
    await page.reload()
    await expect(
      page.locator('article').filter({ hasText: street }),
    ).toContainText('Updated City')
    await page.getByRole('button', { name: 'Add address', exact: true }).click()
    await page.getByLabel('Address label', { exact: true }).fill('Office')
    await page
      .getByLabel('Recipient name', { exact: true })
      .fill('Office Recipient')
    await page.getByLabel('Phone (E.164)', { exact: true }).fill('+12025550124')
    await page
      .getByLabel('Street address', { exact: true })
      .fill('Controlled office street')
    await page.getByLabel('City', { exact: true }).fill('Office City')
    await page.getByLabel('Country code (ISO)', { exact: true }).fill('US')
    await page
      .getByRole('checkbox', { name: 'Default address', exact: true })
      .check()
    await page
      .getByRole('button', { name: 'Save address', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Office · Default', exact: true }),
    ).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page
      .locator('article')
      .filter({
        has: page.getByRole('heading', {
          name: 'Office · Default',
          exact: true,
        }),
      })
      .getByRole('button', { name: 'Delete address', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Home · Default', exact: true }),
    ).toBeVisible()
    const admin = await page.context().newPage()
    admin.on('pageerror', (error) => errors.push(error.message))
    try {
      await login(admin, adminOrigin, owner, '/customers')
      await admin
        .getByLabel('Search customers', { exact: true })
        .fill(customer.email)
      await admin
        .getByRole('button', { name: 'Search customers', exact: true })
        .click()
      const row = admin.getByRole('row').filter({ hasText: customer.email })
      await expect(row).toContainText('Current Customer ' + f.key)
      await row
        .getByRole('button', { name: 'View customer', exact: true })
        .click()
      await expect(admin.getByRole('dialog')).toContainText('1 saved addresses')
      await expect(admin.getByText(street, { exact: true })).toHaveCount(0)
      await expect(
        admin.getByRole('button', { name: 'Delete customer', exact: true }),
      ).toHaveCount(0)
      await expect(
        admin.getByText('Lifetime spend', { exact: true }),
      ).toHaveCount(0)
    } finally {
      await admin.close()
    }
    page.once('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: 'Delete address', exact: true })
      .click()
    await expect(
      page.getByText('No saved addresses yet.', { exact: true }),
    ).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await f.close()
  }
})
