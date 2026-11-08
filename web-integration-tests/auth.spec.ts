import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  CatalogTestFixture,
  bearer,
  type CatalogRole,
} from '../api-tests/catalog-test-support'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../src/auth/credentials/email-verification.crypto'
const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
})
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) || []).toEqual([])
})
const userOrigin = 'http://127.0.0.1:3300',
  adminOrigin = 'http://127.0.0.1:3301'
async function account(
  f: CatalogTestFixture,
  request: APIRequestContext,
  role: CatalogRole = 'CUSTOMER',
) {
  const credentials = f.browserCredentials()
  const response = await request.post('/v1/auth/register', {
    data: credentials,
  })
  expect(response.status()).toBe(201)
  const registered = (await response.json()) as {
    user: { id: string }
    refreshToken: string
  }
  expect(
    (
      await request.post('/v1/auth/logout', {
        data: { refreshToken: registered.refreshToken },
      })
    ).status(),
  ).toBe(200)
  if (role !== 'CUSTOMER')
    await f.db.user.update({
      where: { id: registered.user.id },
      data: { role },
    })
  return { ...credentials, id: registered.user.id }
}
async function login(
  page: Page,
  origin: string,
  credentials: { email: string; password: string },
  next = '',
) {
  await page.goto(
    origin + '/sign-in' + (next ? '?next=' + encodeURIComponent(next) : ''),
  )
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
async function actionToken(
  f: CatalogTestFixture,
  userId: string,
  eventType: string,
) {
  const event = await f.db.outboxEvent.findFirst({
    where: { eventType, payload: { path: ['userId'], equals: userId } },
    orderBy: { createdAt: 'desc' },
  })
  expect(event).not.toBeNull()
  const payload = event!.payload as unknown as {
    eventId: string
    token: EncryptedActionToken
  }
  return decryptEmailActionToken(
    process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY!,
    payload.token,
    `${userId}:${payload.eventId}`,
  )
}
async function close(f: CatalogTestFixture) {
  try {
    const users = await f.db.user.findMany({
      where: { email: { startsWith: `catalog-${f.key}-browser-` } },
      select: { id: true },
    })
    if (users.length)
      await f.db.outboxEvent.deleteMany({
        where: {
          eventType: {
            in: [
              'auth.email_verification.requested',
              'auth.password_reset.requested',
            ],
          },
          OR: users.map((user) => ({
            payload: { path: ['userId'], equals: user.id },
          })),
        },
      })
  } finally {
    await f.close()
  }
}
test('User signup keeps login through reload and concurrent tabs without browser-readable secrets', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request),
    credentials = f.browserCredentials()
  try {
    await page.goto(userOrigin + '/account')
    await expect(page).toHaveURL(/\/sign-in\?next=/)
    await page
      .getByRole('link', { name: 'Create an account', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Create your account', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(credentials.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(credentials.password)
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill(credentials.password)
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click()
    await expect(page).toHaveURL(userOrigin + '/account')
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(credentials.email, { exact: true }),
    ).toBeVisible()
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookies: document.cookie,
      }),
    )
    expect(storage).not.toMatch(/accessToken|refreshToken|Bearer /)
    expect(storage).not.toContain(credentials.password)
    const active = await f.db.user.findUnique({
      where: { email: credentials.email },
    })
    expect(active?.role).toBe('CUSTOMER')
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === 'eshop-user-session',
    )
    expect(
      Boolean(
        cookie?.httpOnly &&
        cookie.sameSite === 'Lax' &&
        cookie.expires > Date.now() / 1000,
      ),
    ).toBe(true)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(credentials.email, { exact: true }),
    ).toBeVisible()
    const other = await page.context().newPage()
    try {
      await other.goto(userOrigin + '/account')
      await expect(
        other.getByText(credentials.email, { exact: true }),
      ).toBeVisible()
      await Promise.all([page.reload(), other.reload()])
      await expect(
        page.getByText(credentials.email, { exact: true }),
      ).toBeVisible()
      await expect(
        other.getByText(credentials.email, { exact: true }),
      ).toBeVisible()
    } finally {
      await other.close()
    }
  } finally {
    await close(f)
  }
})
test('User logout revokes the server session and cannot resurrect private state with browser Back', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const credentials = await account(f, request)
    await login(page, userOrigin, credentials)
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('link', { name: 'Security settings', exact: true })
      .click()
    await page
      .getByRole('link', { name: 'Back to your account', exact: true })
      .click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect
      .poll(() =>
        f.db.authSession.count({
          where: { userId: credentials.id, revokedAt: null },
        }),
      )
      .toBe(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toHaveCount(0)
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in/)
    expect(
      (await page.context().cookies()).some(
        (item) => item.name === 'eshop-user-session',
      ),
    ).toBe(false)
  } finally {
    await close(f)
  }
})
test('User and Admin reject the wrong audience and ignore external return URLs', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await account(f, request),
      staff = await account(f, request, 'STAFF')
    await login(page, adminOrigin, customer)
    await expect(page.locator('section').getByRole('alert')).toContainText(
      'not valid',
    )
    await login(page, userOrigin, staff)
    await expect(page.locator('section').getByRole('alert')).toContainText(
      'not valid',
    )
    await login(page, userOrigin, customer, '//example.test/escape')
    await expect(page).toHaveURL(userOrigin + '/account')
  } finally {
    await close(f)
  }
})
test('Admin uses real current grants, guards deep links and hides revoked sections on focus', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let previous: string[] | undefined,
    ownerToken = ''
  try {
    const owner = await account(f, request, 'OWNER'),
      staff = await account(f, request, 'STAFF')
    const auth = await request.post('/v1/admin/auth/login', {
      data: { email: owner.email, password: owner.password },
    })
    expect(auth.status()).toBe(200)
    ownerToken = ((await auth.json()) as { accessToken: string }).accessToken
    const roles = await request.get('/v1/admin/roles', {
      headers: bearer(ownerToken),
    })
    expect(roles.status()).toBe(200)
    previous = (
      (await roles.json()) as Array<{ key: string; permissions: string[] }>
    ).find((r) => r.key === 'SUPPORT')!.permissions
    expect(
      (
        await request.patch('/v1/admin/roles/SUPPORT/permissions', {
          headers: bearer(ownerToken),
          data: { permissions: ['orders.manage'] },
        })
      ).status(),
    ).toBe(200)
    await page.goto(adminOrigin + '/orders')
    await expect(page).toHaveURL(/\/sign-in\?next=/)
    await login(page, adminOrigin, staff, '/orders')
    await expect(
      page.getByRole('heading', { name: 'Orders', exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: 'Orders', exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: 'Staff & roles', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText('Olivia Bennett', { exact: true })).toHaveCount(
      0,
    )
    expect(
      (
        await request.patch('/v1/admin/roles/SUPPORT/permissions', {
          headers: bearer(ownerToken),
          data: { permissions: [] },
        })
      ).status(),
    ).toBe(200)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(
      page.getByRole('heading', { name: 'Access restricted' }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: 'Orders', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in/)
  } finally {
    if (previous && ownerToken)
      expect(
        (
          await request.patch('/v1/admin/roles/SUPPORT/permissions', {
            headers: bearer(ownerToken),
            data: { permissions: previous },
          })
        ).status(),
      ).toBe(200)
    await close(f)
  }
})
test('disabled accounts lose the live browser session on identity refresh', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const credentials = await account(f, request)
    await login(page, userOrigin, credentials)
    await expect(
      page.getByRole('heading', { name: 'Your account', exact: true }),
    ).toBeVisible()
    await f.db.user.update({
      where: { id: credentials.id },
      data: { status: 'DISABLED' },
    })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(
      page.getByText('Your session ended. Please sign in again.', {
        exact: true,
      }),
    ).toBeVisible()
  } finally {
    await close(f)
  }
})
test('verification links use memory-only fragments and a real one-time backend challenge', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const credentials = await account(f, request)
    await login(page, userOrigin, credentials)
    await expect(page).toHaveURL(userOrigin + '/account')
    await page
      .getByRole('link', { name: 'Security settings', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Request verification email', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText(
      'Verification requested',
    )
    const token = await actionToken(
      f,
      credentials.id,
      'auth.email_verification.requested',
    )
    await page.goto(userOrigin + '/verify-email#token=' + token)
    await expect(
      page.getByRole('button', { name: 'Verify email', exact: true }),
    ).toBeEnabled()
    expect(page.url()).not.toContain(token)
    await page
      .getByRole('button', { name: 'Verify email', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText(
      'verification was accepted',
    )
    expect(
      (await f.db.user.findUnique({ where: { id: credentials.id } }))
        ?.emailVerifiedAt,
    ).not.toBeNull()
    await page.goto(userOrigin + '/verify-email#token=' + token)
    await page
      .getByRole('button', { name: 'Verify email', exact: true })
      .click()
    await expect(page.locator('section').getByRole('alert')).toBeVisible()
  } finally {
    await close(f)
  }
})
test('password reset requests stay non-enumerating and browser reset revokes old credentials', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const credentials = await account(f, request)
    await page.goto(userOrigin + '/forgot-password')
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(credentials.email)
    await page.getByRole('button', { name: 'Send recovery link' }).click()
    await expect(page.getByRole('status')).toContainText(
      'If an eligible account exists',
    )
    const token = await actionToken(
        f,
        credentials.id,
        'auth.password_reset.requested',
      ),
      password = 'Reset-' + randomUUID() + '-Aa1!'
    await page.goto(userOrigin + '/reset-password#token=' + token)
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    expect(page.url()).not.toContain(token)
    await page.getByLabel('New password', { exact: true }).fill(password)
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill(password)
    await page
      .getByRole('button', { name: 'Reset password', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText('password was changed')
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: credentials.email, password: credentials.password },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: credentials.email, password },
        })
      ).status(),
    ).toBe(200)
  } finally {
    await close(f)
  }
})
test('password change uses current credentials and signs out the browser', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const credentials = await account(f, request)
    await login(page, userOrigin, credentials)
    await expect(page).toHaveURL(userOrigin + '/account')
    await page
      .getByRole('link', { name: 'Security settings', exact: true })
      .click()
    const password = 'Changed-' + randomUUID() + '-Aa1!'
    let refreshes = 0
    page.on('request', (req) => {
      if (req.url().endsWith('/v1/auth/refresh')) refreshes++
    })
    await page
      .getByLabel('Current password', { exact: true })
      .fill('Wrong-password-long-1!')
    await page.getByLabel('New password', { exact: true }).fill(password)
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill(password)
    await page
      .getByRole('button', { name: 'Change password', exact: true })
      .click()
    await expect(page.locator('section').getByRole('alert')).toBeVisible()
    expect(refreshes).toBe(0)
    await expect(page).toHaveURL(userOrigin + '/account/settings')
    await page
      .getByLabel('Current password', { exact: true })
      .fill(credentials.password)
    await page.getByLabel('New password', { exact: true }).fill(password)
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill(password)
    await page
      .getByRole('button', { name: 'Change password', exact: true })
      .click()
    await expect(page).toHaveURL(/\/sign-in/)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: credentials.email, password: credentials.password },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: credentials.email, password },
        })
      ).status(),
    ).toBe(200)
  } finally {
    await close(f)
  }
})

test('Admin survives reload and remains isolated from customer login and logout', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await account(f, request),
      owner = await account(f, request, 'OWNER')
    await login(page, userOrigin, customer)
    await expect(page.getByText(customer.email, { exact: true })).toBeVisible()
    const admin = await page.context().newPage()
    try {
      await admin.goto(adminOrigin + '/products')
      await expect(admin).toHaveURL(/\/sign-in/)
      await login(admin, adminOrigin, owner, '/products')
      await expect(admin).toHaveURL(adminOrigin + '/products')
      await admin.reload()
      await expect(admin).toHaveURL(adminOrigin + '/products')
      await expect(
        admin.getByRole('heading', { name: 'Products', exact: true }),
      ).toBeVisible()
      const names = (await page.context().cookies())
        .filter((c) => c.httpOnly)
        .map((c) => c.name)
      expect(names).toContain('eshop-user-session')
      expect(names).toContain('eshop-admin-session')
      await page.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(page).toHaveURL(/\/sign-in/)
      await admin.reload()
      await expect(
        admin.getByRole('heading', { name: 'Products', exact: true }),
      ).toBeVisible()
    } finally {
      await admin.close()
    }
  } finally {
    await close(f)
  }
})

test('persistent cookie restores a new browser context and logout clears every open user tab', async ({
  page,
  browser,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await account(f, request)
    await login(page, userOrigin, customer)
    await expect(page.getByText(customer.email, { exact: true })).toBeVisible()
    const state = await page.context().storageState()
    const reopened = await browser.newContext({
      storageState: { cookies: state.cookies, origins: [] },
    })
    try {
      const tab = await reopened.newPage()
      await tab.goto(userOrigin + '/account')
      await expect(tab.getByText(customer.email, { exact: true })).toBeVisible()
      const other = await reopened.newPage()
      await other.goto(userOrigin + '/account')
      await expect(
        other.getByText(customer.email, { exact: true }),
      ).toBeVisible()
      await tab.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(tab).toHaveURL(/\/sign-in/)
      await expect(other).toHaveURL(/\/sign-in/)
      await other.reload()
      await expect(other).toHaveURL(/\/sign-in/)
    } finally {
      await reopened.close()
    }
  } finally {
    await close(f)
  }
})

test('same-origin session endpoint rejects CSRF and never returns a refresh token', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await account(f, request)
    await login(page, userOrigin, customer)
    await expect(page.getByText(customer.email, { exact: true })).toBeVisible()
    const response = await page
      .context()
      .request.post(userOrigin + '/api/auth/session', {
        headers: {
          Origin: 'https://attacker.example.test',
          'X-eShop-Session': '1',
        },
        data: { action: 'logout' },
      })
    expect(response.status()).toBe(403)
    const refresh = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-eShop-Session': '1' },
        body: JSON.stringify({ action: 'refresh' }),
      })
      const body = await response.json()
      return {
        status: response.status,
        hasRefresh: 'refreshToken' in body,
        hasAccess: typeof body.accessToken === 'string',
      }
    })
    expect(refresh).toEqual({ status: 200, hasRefresh: false, hasAccess: true })
    await page.reload()
    await expect(page.getByText(customer.email, { exact: true })).toBeVisible()
  } finally {
    await close(f)
  }
})

test('an expired backend refresh session cannot restore login after reload', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await account(f, request)
    await login(page, userOrigin, customer)
    await expect(page.getByText(customer.email, { exact: true })).toBeVisible()
    await f.db.authSession.updateMany({
      where: { userId: customer.id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 60000) },
    })
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in/)
    expect(
      (await page.context().cookies()).some(
        (c) => c.name === 'eshop-user-session',
      ),
    ).toBe(false)
  } finally {
    await close(f)
  }
})

test('customer account switching replaces the identity in every open tab', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const first = await account(f, request),
      second = await account(f, request)
    await login(page, userOrigin, first)
    await expect(page.getByText(first.email, { exact: true })).toBeVisible()
    const other = await page.context().newPage()
    try {
      await other.goto(userOrigin + '/account')
      await expect(other.getByText(first.email, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(page).toHaveURL(/\/sign-in/)
      await expect(other).toHaveURL(/\/sign-in/)
      await login(page, userOrigin, second)
      await expect(page.getByText(second.email, { exact: true })).toBeVisible()
      await expect(other.getByText(second.email, { exact: true })).toBeVisible()
      await expect(other.getByText(first.email, { exact: true })).toHaveCount(0)
    } finally {
      await other.close()
    }
  } finally {
    await close(f)
  }
})
