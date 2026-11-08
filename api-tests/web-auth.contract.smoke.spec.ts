import { test, expect } from '@playwright/test'
test('web auth contract: token/session and logout success responses are explicit', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const spec = await response.json()
  expect(spec.components.schemas.TokenPairDto.required).toEqual(
    expect.arrayContaining([
      'accessToken',
      'refreshToken',
      'tokenType',
      'expiresIn',
      'user',
    ]),
  )
  for (const path of [
    '/v1/auth/login',
    '/v1/admin/auth/login',
    '/v1/auth/refresh',
  ])
    expect(
      spec.paths[path].post.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/TokenPairDto')
  expect(
    spec.paths['/v1/auth/logout'].post.responses['200'].content[
      'application/json'
    ].schema.$ref,
  ).toBe('#/components/schemas/LogoutResultDto')
  expect(
    spec.components.schemas.LogoutResultDto.properties.loggedOut.type,
  ).toBe('boolean')
  expect(spec.paths['/v1/admin/auth/register']).toBeUndefined()
})
