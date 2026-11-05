import { test } from '@playwright/test'
import { EmailFixture, expect, bearer } from './email-delivery-test-support'
import { assertSafeError } from './catalog-test-support'
test('email delivery security: every email administration route is OWNER-only and never exposes secrets or action content (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const customer = await f.account('CUSTOMER'),
      staff = await f.account('STAFF'),
      owner = await f.account('OWNER')
    const routes = [
      ['get', '/v1/admin/email/status'],
      ['get', '/v1/admin/email/templates'],
      ['put', '/v1/admin/email/templates/EMAIL_VERIFY'],
      ['get', '/v1/admin/email/deliveries'],
      ['get', '/v1/admin/email/planning-failures'],
    ] as const
    for (const [method, path] of routes) {
      await assertSafeError(await request[method](path), 401)
      for (const user of [customer, staff])
        await assertSafeError(
          await request[method](path, { headers: bearer(user.token) }),
          403,
        )
    }
    const status = await request.get('/v1/admin/email/status', {
      headers: bearer(owner.token),
    })
    expect(status.status()).toBe(200)
    expect(status.headers()['cache-control']).toBe('no-store')
    expect(await status.json()).toMatchObject({
      mode: 'disabled',
      providerVerified: false,
    })
    expect(JSON.stringify(await status.json())).not.toMatch(
      /SMTP_PASSWORD|smtpUser|password|sender@example|allowlist.*@/i,
    )
    for (const query of [
      'limit=51',
      'page=0',
      'status=SENT',
      'userId=' + customer.id,
    ])
      await assertSafeError(
        await request.get('/v1/admin/email/deliveries?' + query, {
          headers: bearer(owner.token),
        }),
        400,
      )
    expect(
      (
        await request.post('/v1/admin/email/send', {
          headers: bearer(owner.token),
          data: { to: customer.email },
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
test('email delivery security: safe template overrides have current revisions; token/link/sender injection is forbidden (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request),
    key = 'EMAIL_VERIFY',
    prior = await f.db.emailTemplate.findUnique({ where: { key } })
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token),
      expectedRevision = prior?.revision ?? 0
    for (const data of [
      { subject: 'bad\r\nBcc:x', text: 'hello' },
      { subject: 'Verify', text: '<a href=x>bad</a>' },
      { subject: 'Verify', text: '{token}' },
      { subject: 'Verify', text: '{actionUrl}' },
      { subject: 'Verify', text: '{orderId}' },
      { subject: 'Verify', text: 'safe', from: 'evil@example.test' },
    ])
      await assertSafeError(
        await request.put('/v1/admin/email/templates/' + key, {
          headers,
          data: { expectedRevision, ...data },
        }),
        400,
      )
    const input = {
      expectedRevision,
      subject: 'Confirm your email',
      text: 'Please follow the one-time confirmation link below.',
    }
    expect(
      (
        await request.put('/v1/admin/email/templates/' + key, {
          headers,
          data: input,
        })
      ).status(),
    ).toBe(200)
    await assertSafeError(
      await request.put('/v1/admin/email/templates/' + key, {
        headers,
        data: input,
      }),
      409,
    )
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'email.template.saved',
          targetId: key,
        },
      }),
    ).toBe(1)
  } finally {
    if (prior)
      await f.db.emailTemplate.upsert({
        where: { key },
        create: prior,
        update: prior,
      })
    else await f.db.emailTemplate.deleteMany({ where: { key } })
    await f.close()
  }
})
