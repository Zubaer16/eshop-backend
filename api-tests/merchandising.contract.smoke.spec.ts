import { expect, test } from '@playwright/test'

test('G5 OpenAPI: public projections, strict content contracts and bearer RBAC (execution G12)', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const entity of ['banners', 'collections'])
    for (const [method, path] of [
      ['get', '/v1/admin/store/' + entity],
      ['post', '/v1/admin/store/' + entity],
      ['get', '/v1/admin/store/' + entity + '/{id}'],
      ['put', '/v1/admin/store/' + entity + '/{id}'],
      ['delete', '/v1/admin/store/' + entity + '/{id}'],
    ]) {
      const op = doc.paths[path!][method!]
      expect(op.tags).toEqual(['Merchandising / Admin'])
      expect(op.security).toContainEqual({ 'access-token': [] })
      for (const status of ['400', '401', '403', '404', '409'])
        expect(op.responses).toHaveProperty(status)
    }
  for (const path of ['/v1/store/homepage', '/v1/store/collections/{slug}']) {
    expect(doc.paths[path].get.security ?? []).toEqual([])
    expect(doc.paths[path].get.responses).toHaveProperty('503')
  }
  expect(
    Object.keys(doc.components.schemas.PublicStoreBannerDto.properties).sort(),
  ).toEqual([
    'ctaHref',
    'ctaText',
    'headline',
    'id',
    'image',
    'position',
    'slot',
    'subtitle',
  ])
  const image = doc.components.schemas.MerchandisingImageDto.properties
  expect(image).not.toHaveProperty('objectKey')
  expect(image).not.toHaveProperty('providerAssetId')
  expect(doc.components.schemas.SaveStoreBannerDto.properties).toHaveProperty(
    'imageMediaId',
  )
  expect(
    doc.components.schemas.SaveStoreBannerDto.properties,
  ).not.toHaveProperty('imageUrl')
  expect((await request.get('/v1/store/homepage')).status()).toBe(503)
  expect((await request.get('/v1/admin/store/banners')).status()).toBe(401)
})
