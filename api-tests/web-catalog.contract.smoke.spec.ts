import { test, expect } from '@playwright/test'
test('web catalog contract describes media library, canonical variants and authoritative inventory responses', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  const library = doc.paths['/v1/admin/media'].get
  expect(library.security).toEqual(
    expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
  )
  expect(library.parameters.map((p: { name: string }) => p.name)).toEqual(
    expect.arrayContaining(['page', 'limit', 'status', 'id']),
  )
  expect(library.responses['200'].content['application/json'].schema.$ref).toBe(
    '#/components/schemas/MediaLibraryPageDto',
  )
  for (const field of [
    'objectKey',
    'providerAssetId',
    'tokenHash',
    'uploadExpiresAt',
  ])
    expect(
      doc.components.schemas.MediaAssetPublicDto.properties,
    ).not.toHaveProperty(field)
  expect(
    doc.paths['/v1/products'].get.parameters.map(
      (p: { name: string }) => p.name,
    ),
  ).toContain('currency')
  const product = doc.components.schemas.CatalogProductResponseDto.properties
  for (const field of [
    'sku',
    'currency',
    'priceMinor',
    'compareAtMinor',
    'hasVariants',
    'stockOnHand',
    'variants',
    'categoryIds',
  ])
    expect(product).toHaveProperty(field)
  expect(product.variants.items.$ref).toBe(
    '#/components/schemas/CatalogVariantResponseDto',
  )
  expect(
    doc.paths['/v1/admin/inventory'].get.responses['200'].content[
      'application/json'
    ].schema.$ref,
  ).toBe('#/components/schemas/InventoryBalancePageDto')
  expect(
    doc.paths['/v1/admin/inventory/{id}/adjustments'].post.responses['201']
      .content['application/json'].schema.$ref,
  ).toBe('#/components/schemas/InventoryAdjustmentResponseDto')
})
