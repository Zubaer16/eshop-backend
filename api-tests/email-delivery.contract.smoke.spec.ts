import { expect, test } from '@playwright/test'
test('email delivery OpenAPI: owner email status, safe history and templates without send/debug/secret endpoints (execution release acceptance)', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  for (const [method, path] of [
    ['get', '/v1/admin/email/status'],
    ['get', '/v1/admin/email/templates'],
    ['put', '/v1/admin/email/templates/{key}'],
    ['get', '/v1/admin/email/deliveries'],
    ['get', '/v1/admin/email/planning-failures'],
  ]) {
    const op = doc.paths[path!][method!]
    expect(op.tags).toEqual(['Email / Admin'])
    expect(op.security).toContainEqual({ 'access-token': [] })
    for (const code of ['401', '403', '503'])
      expect(op.responses).toHaveProperty(code)
  }
  expect(
    Object.keys(doc.components.schemas.EmailStatusDto.properties).sort(),
  ).toEqual([
    'configured',
    'controlledRecipientCount',
    'mode',
    'provider',
    'providerVerified',
    'senderConfigured',
    'tlsMode',
  ])
  const fields = doc.components.schemas.EmailDeliveryDto.properties
  for (const field of [
    'to',
    'email',
    'token',
    'text',
    'subject',
    'payload',
    'recipientHash',
    'userId',
    'leaseToken',
  ])
    expect(fields).not.toHaveProperty(field)
  expect(doc.paths).not.toHaveProperty('/v1/admin/email/send')
  expect(
    doc.components.schemas.SaveEmailTemplateDto.properties,
  ).not.toHaveProperty('from')
})
