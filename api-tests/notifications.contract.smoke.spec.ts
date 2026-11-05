import { expect, test } from '@playwright/test'
test('notifications OpenAPI: authenticated own inbox, safe preferences, templates and failures (execution release acceptance)', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const [method, path] of [
    ['get', '/v1/notifications'],
    ['get', '/v1/notifications/preferences'],
    ['put', '/v1/notifications/preferences'],
    ['put', '/v1/notifications/read-all'],
    ['put', '/v1/notifications/{id}/read'],
    ['get', '/v1/notifications/{id}/target'],
    ['get', '/v1/admin/notifications/templates'],
    ['put', '/v1/admin/notifications/templates/{key}'],
    ['get', '/v1/admin/notifications/failures'],
  ]) {
    const op = doc.paths[path!][method!]
    expect(op.security).toContainEqual({ 'access-token': [] })
    expect(op.responses).toHaveProperty('401')
    expect(op.responses).toHaveProperty('503')
  }
  expect(
    Object.keys(doc.components.schemas.NotificationItemDto.properties).sort(),
  ).toEqual([
    'audience',
    'body',
    'createdAt',
    'id',
    'image',
    'kind',
    'readAt',
    'targetId',
    'targetType',
    'title',
  ])
  expect(
    doc.components.schemas.NotificationPreferencesDto.properties,
  ).toHaveProperty('securityEmailRequired')
  expect(
    doc.components.schemas.SaveNotificationPreferencesDto.properties,
  ).not.toHaveProperty('userId')
  for (const path of ['/v1/notifications', '/v1/admin/notifications/templates'])
    expect((await request.get(path)).status()).toBe(401)
})
