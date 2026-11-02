import { expect, test } from '@playwright/test'

test('05B-4 OpenAPI: public typed bootstrap, no bearer and no update endpoint', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  const operation = doc.paths['/v1/store/bootstrap']?.get
  expect(operation?.tags).toEqual(['Store Bootstrap / Public'])
  expect(operation?.security || []).toEqual([])
  expect(operation?.responses['200']).toBeDefined()
  expect(operation?.responses['503']).toBeDefined()
  expect(Object.keys(doc.paths['/v1/store/bootstrap']).sort()).toEqual(['get'])
  const schemas = doc.components.schemas
  expect(
    Object.keys(schemas.PublicStoreBootstrapDto.properties).sort(),
  ).toEqual(['branding', 'content', 'profile', 'schemaVersion'])
  for (const key of [
    'PublicStoreProfileDto',
    'PublicStoreContentDto',
    'PublicStoreBrandingDto',
  ]) {
    expect(schemas[key]).toBeDefined()
  }
  expect(schemas.PublicStoreBootstrapDto.properties.profile.$ref).toContain(
    'PublicStoreProfileDto',
  )
  expect(schemas.PublicStoreBootstrapDto.properties.content.$ref).toContain(
    'PublicStoreContentDto',
  )
  expect(schemas.PublicStoreBootstrapDto.properties.branding.$ref).toContain(
    'PublicStoreBrandingDto',
  )
  const live = await request.get('/v1/store/bootstrap')
  // Smoke deliberately has no DATABASE_URL. Successful response/allowlist
  // assertions run in store-bootstrap.db.spec.ts against real PostgreSQL.
  expect(live.status()).toBe(503)
  expect(live.headers()['cache-control']).toContain('no-store')
})
