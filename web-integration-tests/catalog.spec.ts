import { test, expect } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'

test('Admin publishes verified media and variants; User sees the same UUID, exact price and changed stock; adjustment retry is idempotent', async ({
  page,
  request,
}) => {
  test.setTimeout(180000)
  const f = new CatalogTestFixture(request),
    mediaIds: string[] = []
  let ownerId = ''
  const credentials = f.browserCredentials(),
    title = 'Web Catalog ' + f.key,
    variantSku = f.sku('blue-large')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    const registered = await request.post('/v1/auth/register', {
      data: credentials,
    })
    expect(registered.status()).toBe(201)
    const identity = await registered.json()
    ownerId = identity.user.id as string
    await f.db.user.update({
      where: { id: identity.user.id },
      data: { role: 'OWNER' },
    })
    await request.post('/v1/auth/logout', {
      data: { refreshToken: identity.refreshToken },
    })
    await page.goto('http://127.0.0.1:3301/sign-in?next=%2Fcategories')
    await page.getByLabel('Email', { exact: true }).fill(credentials.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Categories', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Add category', exact: true })
      .click()
    await page.getByLabel('Category name', { exact: true }).fill('Web ' + f.key)
    await page
      .getByLabel('Canonical slug', { exact: true })
      .fill(f.slug('navigation'))
    await page
      .getByRole('button', { name: 'Save category', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Category saved.' }),
    ).toHaveText('Category saved.')
    await page.getByRole('link', { name: 'Products', exact: true }).click()
    await page.getByRole('button', { name: 'Add product', exact: true }).click()
    await page.getByLabel('Product title', { exact: true }).fill(title)
    await page
      .getByLabel('Canonical slug', { exact: true })
      .fill(f.slug('published'))
    await page.getByLabel('Base SKU', { exact: true }).fill(f.sku('base'))
    await page.getByLabel('Price (USD)', { exact: true }).fill('25.10')
    await page
      .getByRole('checkbox', { name: 'Web ' + f.key, exact: true })
      .check()
    const createdResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/v1/admin/products') &&
        r.request().method() === 'POST',
    )
    await page
      .getByRole('button', { name: 'Save product', exact: true })
      .click()
    const created = await (await createdResponse).json(),
      productId = created.id as string
    await expect(page.getByRole('dialog')).toContainText(
      'Canonical product ID: ' + productId,
    )
    await page.getByRole('button', { name: 'Add variant', exact: true }).click()
    await page.getByLabel('Variant SKU', { exact: true }).fill(variantSku)
    await page.getByLabel('Size', { exact: true }).fill('Large')
    await page.getByLabel('Color', { exact: true }).fill('Blue')
    await page
      .getByLabel('Override price (USD, blank inherits)', { exact: true })
      .fill('19.95')
    await page.getByLabel('Initial variant stock', { exact: true }).fill('3')
    await page
      .getByRole('button', { name: 'Save variant', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toContainText(variantSku)
    const signedResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/v1/admin/media/uploads') &&
        r.request().method() === 'POST',
    )
    await page.getByLabel('Upload image', { exact: true }).setInputFiles({
      name: 'controlled.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=',
        'base64',
      ),
    })
    const mediaId = (
      (await (await signedResponse).json()) as { mediaId: string }
    ).mediaId
    mediaIds.push(mediaId)
    await expect(
      page.getByText('Image verified and available in the library.', {
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByTestId('media-asset-' + mediaId)
      .getByRole('button', { name: 'Use image', exact: true })
      .click()
    await page
      .getByLabel('Image 1 alt text', { exact: true })
      .fill('Controlled verified gallery image')
    await page
      .getByRole('button', { name: 'Save gallery', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Save gallery', exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click()
    const row = page.getByRole('row').filter({ hasText: title })
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    await page
      .getByLabel('Publication status', { exact: true })
      .selectOption('ACTIVE')
    await page
      .getByRole('button', { name: 'Save product', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toContainText('ACTIVE')
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click()
    const user = await page.context().newPage()
    user.on('pageerror', (e) => errors.push(e.message))
    try {
      await user.goto('http://127.0.0.1:3300/shop?q=' + f.key)
      await expect(
        user.getByRole('link', { name: title, exact: true }),
      ).toBeVisible()
      await user.getByRole('link', { name: title, exact: true }).click()
      await expect(
        user.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible()
      await expect(user.locator('section[data-product-id]')).toHaveAttribute(
        'data-product-id',
        productId,
      )
      await user
        .getByLabel('Size / color', { exact: true })
        .selectOption({ label: 'Large / Blue — $19.95' })
      await expect(
        user.getByText('Selected option is in stock', { exact: true }),
      ).toBeVisible()
      await expect(
        user
          .getByRole('img', { name: 'Controlled verified gallery image' })
          .first(),
      ).toBeVisible()
      await page.goto('http://127.0.0.1:3301/inventory?productId=' + productId)
      await page
        .getByRole('row')
        .filter({ hasText: variantSku })
        .getByRole('button', { name: 'Balance details', exact: true })
        .click()
      let dropped = false
      await page.route('**/v1/admin/inventory/*/adjustments', async (route) => {
        if (!dropped) {
          dropped = true
          await route.fetch()
          await route.abort('failed')
        } else await route.continue()
      })
      await page.getByLabel('Signed units', { exact: true }).fill('2')
      await page
        .getByRole('button', { name: 'Apply adjustment', exact: true })
        .click()
      await expect(
        page.getByRole('button', {
          name: 'Retry same adjustment',
          exact: true,
        }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Retry same adjustment', exact: true })
        .click()
      await expect(
        page.getByText(
          'Existing adjustment confirmed; no duplicate stock change.',
          {
            exact: true,
          },
        ),
      ).toBeVisible()
      await expect(page.getByRole('dialog')).toContainText('Physical 5')
      await page.getByLabel('Signed units', { exact: true }).fill('-5')
      await page
        .getByLabel('Adjustment reason', { exact: true })
        .selectOption('DAMAGE')
      await page
        .getByRole('button', { name: 'Apply adjustment', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toContainText('Physical 0')
      await user
        .getByRole('button', {
          name: 'Refresh product availability',
          exact: true,
        })
        .click()
      await expect(
        user.getByText('Selected option is unavailable', { exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click()
      await page.goto('http://127.0.0.1:3301/products')
      await page.getByLabel('Search products', { exact: true }).fill(f.key)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      page.once('dialog', (dialog) => dialog.accept())
      await page
        .getByRole('row')
        .filter({ hasText: title })
        .getByRole('button', { name: 'Archive', exact: true })
        .click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Product archived.' }),
      ).toHaveText('Product archived.')
      const missing = await user.goto(
        'http://127.0.0.1:3300/product/' + f.slug('published'),
      )
      expect(missing?.status()).toBe(404)
    } finally {
      await user.close()
    }
    expect(errors).toEqual([])
  } finally {
    try {
      if (ownerId) {
        const requested = await f.db.auditEvent.findMany({
          where: {
            actorId: ownerId,
            action: 'media.upload.requested',
            targetType: 'media',
          },
          select: { targetId: true },
        })
        mediaIds.push(
          ...requested
            .map((row) => row.targetId)
            .filter((id): id is string => typeof id === 'string'),
        )
      }
      await f.db.productMedia.deleteMany({
        where: { mediaId: { in: mediaIds } },
      })
      await f.db.mediaDeletionJob.deleteMany({
        where: { mediaId: { in: mediaIds } },
      })
      await f.db.outboxEvent.deleteMany({
        where: { eventType: 'media.renditions', id: { in: mediaIds } },
      })
      await f.db.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } })
    } finally {
      await f.close()
    }
  }
})

test('a failed public catalog request shows an error without falling back to preview products', async ({
  page,
}) => {
  await page.route('**/v1/products?**', (route) => route.abort('failed'))
  await page.goto('http://127.0.0.1:3300/shop')
  await expect(page.locator('main').getByRole('alert')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry loading', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View product', exact: true }),
  ).toHaveCount(0)
})
