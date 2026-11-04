import { expect, test } from '@playwright/test'
test('G8 OpenAPI: device token is write-only; approved campaigns and provider history are guarded/redacted (execution G12)', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const path of [
    '/v1/notifications/push/devices',
    '/v1/notifications/push/config',
    '/v1/notifications/push/deliveries/{id}/target',
    '/v1/admin/push/campaigns',
    '/v1/admin/push/campaigns/{id}/preview',
    '/v1/admin/push/campaigns/{id}/metrics',
    '/v1/admin/push/status',
    '/v1/admin/push/deliveries',
    '/v1/admin/push/planning-failures',
  ]) {
    const op = doc.paths[path].get
    expect(op.security).toContainEqual({ 'access-token': [] })
    expect(op.responses).toHaveProperty('401')
    expect(op.responses).toHaveProperty('503')
  }
  expect(
    doc.paths['/v1/admin/push/campaigns/{id}/approve'].post.responses,
  ).toHaveProperty('403')
  expect(
    doc.components.schemas.RegisterPushDeviceDto.properties.token.writeOnly,
  ).toBe(true)
  expect(
    Object.keys(doc.components.schemas.PushDeviceDto.properties).sort(),
  ).toEqual([
    'expiresAt',
    'id',
    'installationId',
    'lastSeenAt',
    'revision',
    'status',
    'surface',
  ])
  for (const type of ['PushDeliveryDto', 'PushStatusDto'])
    for (const field of [
      'token',
      'tokenHash',
      'tokenCiphertext',
      'FCM_PRIVATE_KEY',
      'FCM_CLIENT_EMAIL',
      'userId',
    ])
      expect(doc.components.schemas[type].properties).not.toHaveProperty(field)
  expect(
    doc.components.schemas.SavePushCampaignDto.properties,
  ).not.toHaveProperty('targetUrl')
  expect(doc.components.schemas.NotificationItemDto.properties).toHaveProperty(
    'image',
  )
  expect(doc.paths).not.toHaveProperty('/v1/admin/push/send')
})
