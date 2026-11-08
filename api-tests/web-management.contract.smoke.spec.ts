import { test, expect } from '@playwright/test'
test('web navigation is owned JWT input; settings/staff keep secret and financial authority out of public contracts', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const path of [
    '/v1/notifications/{id}/navigation',
    '/v1/notifications/push/deliveries/{id}/navigation',
  ])
    expect(
      doc.paths[path].get.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/WebNotificationNavigationDto')
  expect(
    Object.keys(
      doc.components.schemas.WebNotificationNavigationDto.properties,
    ).sort(),
  ).toEqual(['path', 'surface'])
  expect(
    (
      await request.get(
        '/v1/notifications/00000000-0000-4000-8000-000000000001/navigation',
      )
    ).status(),
  ).toBe(401)
  expect(
    doc.components.schemas.StaffCreateDto.properties.password.writeOnly,
  ).toBe(true)
  expect(doc.components.schemas.StaffUpdateDto.properties).not.toHaveProperty(
    'password',
  )
  expect(
    doc.components.schemas.PublicStoreBootstrapDto.properties,
  ).not.toHaveProperty('revision')
  for (const key of [
    'FCM_PRIVATE_KEY',
    'SMTP_PASSWORD',
    'PUSH_TOKEN_ENCRYPTION_KEY',
    'STRIPE_SECRET_KEY',
  ])
    expect(
      doc.components.schemas.PutStoreOperationsDto.properties,
    ).not.toHaveProperty(key)
})
