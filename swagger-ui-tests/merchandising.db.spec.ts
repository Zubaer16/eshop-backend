import { expect, test } from '@playwright/test'
import {
  bannerInput,
  MerchandisingFixture,
} from '../api-tests/merchandising-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('merchandising Swagger Chromium: content authoring, public projection and revision-checked archive (execution release acceptance)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new MerchandisingFixture(request)
  try {
    const owner = await f.account('OWNER')
    const product = await f.product(owner.token, 'browser')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/store/banners', 401)
    await authorizeInSwagger(page, owner.token)
    await swaggerExecute(page, 'POST', '/v1/admin/store/banners', 400, {
      ...bannerInput,
      ctaHref: '//evil.test',
    })
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/store/banners',
      201,
      {
        ...bannerInput,
        status: 'PUBLISHED',
        headline: 'merchandising Browser banner',
      },
    )
    const banner = await created.json()
    f.bannerIds.push(banner.id)
    const changed = {
      ...bannerInput,
      expectedRevision: 1,
      status: 'PUBLISHED',
      headline: 'merchandising Updated banner',
    }
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/store/banners/{id}',
      200,
      changed,
      { id: banner.id },
    )
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/store/banners/{id}',
      409,
      changed,
      { id: banner.id },
    )
    const collectionResponse = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/store/collections',
      201,
      {
        expectedRevision: 0,
        title: 'merchandising Browser ' + f.key,
        slug: f.slug('browser-collection'),
        description: '',
        status: 'PUBLISHED',
        position: 1,
        productIds: [product.id],
      },
    )
    const collection = await collectionResponse.json()
    f.collectionIds.push(collection.id)
    const home = await swaggerExecute(page, 'GET', '/v1/store/homepage', 200)
    expect((await home.json()).banners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: banner.id,
          headline: 'merchandising Updated banner',
        }),
      ]),
    )
    const detail = await swaggerExecute(
      page,
      'GET',
      '/v1/store/collections/{slug}',
      200,
      undefined,
      { slug: collection.slug },
    )
    expect(await detail.json()).toMatchObject({
      productIds: [product.id],
      products: [{ id: product.id }],
    })
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/store/banners/{id}',
      200,
      undefined,
      { id: banner.id },
      { expectedRevision: 2 },
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/store/collections/{id}',
      200,
      undefined,
      { id: collection.id },
      { expectedRevision: 1 },
    )
    await swaggerExecute(
      page,
      'GET',
      '/v1/store/collections/{slug}',
      404,
      undefined,
      { slug: collection.slug },
    )
  } finally {
    await f.close()
  }
})
