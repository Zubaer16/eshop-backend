import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
async function account(
  f: CatalogTestFixture,
  request: APIRequestContext,
  owner = false,
) {
  const credentials = f.browserCredentials(),
    response = await request.post('/v1/auth/register', { data: credentials })
  expect(response.status()).toBe(201)
  const pair = await response.json()
  if (owner) {
    await f.db.user.update({
      where: { id: pair.user.id },
      data: { role: 'OWNER' },
    })
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
test('Admin published banner/collection appear in live User with canonical products and archived content disappears', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request)
  let bannerId = '',
    collectionId = ''
  try {
    const owner = await account(f, request, true),
      category = await (
        await request.post('/v1/admin/categories', {
          headers: bearer(owner.token),
          data: { name: 'Web Content ' + f.key, slug: f.slug('cat') },
        })
      ).json(),
      created = await request.post('/v1/admin/products', {
        headers: bearer(owner.token),
        data: {
          title: 'Published item ' + f.key,
          slug: f.slug('item'),
          sku: f.sku('item'),
          currency: 'USD',
          priceMinor: 1250,
          status: 'ACTIVE',
          stockOnHand: 4,
          categoryIds: [category.id],
        },
      })
    expect(created.status()).toBe(201)
    const product = await created.json()
    await login(page, 'http://127.0.0.1:3301', owner, '/content')
    await page
      .getByRole('button', { name: 'Create banner', exact: true })
      .click()
    const form = page.locator('form').filter({
      has: page.getByRole('heading', { name: 'Save banner', exact: true }),
    })
    await form.locator('[name="headline"]').fill('Published banner ' + f.key)
    await form.locator('[name="subtitle"]').fill('Published plain text')
    await form.locator('[name="ctaText"]').fill('Browse live catalog')
    await form.locator('[name="ctaHref"]').fill('/shop')
    await form.locator('[name="slot"]').selectOption('hero')
    await form.locator('[name="status"]').selectOption('PUBLISHED')
    page.once('dialog', (d) => d.accept())
    await form.getByRole('button', { name: 'Save banner', exact: true }).click()
    await expect(
      page.getByText('Published banner ' + f.key, { exact: true }),
    ).toBeVisible()
    const banner = await f.db.storeBanner.findFirstOrThrow({
      where: { headline: 'Published banner ' + f.key },
    })
    bannerId = banner.id
    const collection = await request.post('/v1/admin/store/collections', {
      headers: bearer(owner.token),
      data: {
        expectedRevision: 0,
        status: 'PUBLISHED',
        position: 1,
        title: 'Live collection ' + f.key,
        slug: f.slug('collection'),
        description: 'Published collection',
        productIds: [product.id],
      },
    })
    expect(collection.status()).toBe(201)
    collectionId = (await collection.json()).id
    const user = await page.context().newPage()
    try {
      await user.goto('http://127.0.0.1:3300/')
      await expect(
        user.getByRole('heading', {
          name: 'Published banner ' + f.key,
          exact: true,
        }),
      ).toBeVisible()
      await user
        .getByRole('link', { name: 'Live collection ' + f.key, exact: true })
        .click()
      await expect(user).toHaveURL(
        'http://127.0.0.1:3300/collections/' + f.slug('collection'),
      )
      await expect(
        user.getByRole('link', { name: product.title, exact: true }),
      ).toHaveAttribute('href', '/product/' + product.slug)
      expect(
        (
          await request.delete('/v1/admin/store/banners/' + bannerId, {
            headers: bearer(owner.token),
            params: { expectedRevision: banner.revision },
          })
        ).status(),
      ).toBe(200)
      await user.goto('http://127.0.0.1:3300/')
      await expect(
        user.getByRole('heading', {
          name: 'Published banner ' + f.key,
          exact: true,
        }),
      ).toHaveCount(0)
    } finally {
      await user.close()
    }
  } finally {
    if (collectionId)
      await f.db.featuredCollection.delete({ where: { id: collectionId } })
    if (bannerId) await f.db.storeBanner.delete({ where: { id: bannerId } })
    await f.close()
  }
})
test('owned inbox/preference revisions and navigation remain isolated; staff disable invalidates current credentials', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request)
  let notificationId = ''
  try {
    const owner = await account(f, request, true),
      customer = await account(f, request),
      other = await account(f, request),
      staff = f.browserCredentials()
    const note = await f.db.notification.create({
      data: {
        eventId: randomUUID(),
        kind: 'SECURITY_PASSWORD_CHANGED',
        audience: 'SECURITY',
        title: 'Owned message ' + f.key,
        body: 'Owned account message',
        targetType: 'HOME',
        templateRevision: 1,
        recipients: { create: { userId: customer.id } },
      },
      include: { recipients: true },
    })
    notificationId = note.id
    await login(
      page,
      'http://127.0.0.1:3300',
      customer,
      '/account/notifications',
    )
    await expect(
      page.getByRole('heading', {
        name: 'Owned message ' + f.key,
        exact: true,
      }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Mark read', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Mark unread', exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Mark unread', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', {
        name: 'Save notification preferences',
        exact: true,
      })
      .click()
    await expect(
      page.getByText('Notification preferences saved.', { exact: true }),
    ).toBeVisible()
    const target = await request.get(
      '/v1/notifications/' + note.recipients[0]!.id + '/navigation',
      { headers: bearer(customer.token) },
    )
    expect(target.status()).toBe(200)
    expect(await target.json()).toEqual({ path: '/', surface: 'STOREFRONT' })
    expect(
      (
        await request.get(
          '/v1/notifications/' + note.recipients[0]!.id + '/navigation',
          {
            headers: bearer(other.token),
          },
        )
      ).status(),
    ).toBe(404)
    await login(page, 'http://127.0.0.1:3301', owner, '/staff')
    await page
      .getByRole('button', { name: 'Create staff account', exact: true })
      .first()
      .click()
    const form = page.locator('form').filter({
      has: page.getByRole('heading', {
        name: 'Create staff account',
        exact: true,
      }),
    })
    await form.locator('[name="name"]').fill('Web Operator ' + f.key)
    await form.locator('[name="email"]').fill(staff.email)
    await form.locator('[name="password"]').fill(staff.password)
    await form.locator('[name="role"]').selectOption('SUPPORT')
    page.once('dialog', (d) => d.accept())
    await form
      .getByRole('button', { name: 'Create staff account', exact: true })
      .click()
    const row = page
      .locator('article')
      .filter({ has: page.getByText(staff.email, { exact: true }) })
    await expect(row).toBeVisible()
    const pair = await request.post('/v1/admin/auth/login', { data: staff })
    expect(pair.status()).toBe(200)
    const token = (await pair.json()).accessToken
    await row
      .getByRole('button', { name: 'Edit staff member', exact: true })
      .click()
    const edit = page.locator('form').filter({
      has: page.getByRole('heading', {
        name: 'Update staff status/role',
        exact: true,
      }),
    })
    await edit.locator('[name="status"]').selectOption('DISABLED')
    page.once('dialog', (d) => d.accept())
    await edit
      .getByRole('button', { name: 'Update staff status/role', exact: true })
      .click()
    await expect(row).toContainText('DISABLED')
    expect(
      (
        await request.get('/v1/admin/auth/me', { headers: bearer(token) })
      ).status(),
    ).toBe(401)
    await page.goto('http://127.0.0.1:3301/reports')
    await expect(
      page.getByRole('heading', { name: 'Reports', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Download bounded CSV', exact: true }),
    ).toBeVisible()
  } finally {
    if (notificationId)
      await f.db.notification.delete({ where: { id: notificationId } })
    await f.close()
  }
})
