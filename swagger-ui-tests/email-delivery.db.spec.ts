import { expect, test } from '@playwright/test'
import {
  EmailFixture,
  RecordingEmailProvider,
} from '../api-tests/email-delivery-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'
test('email delivery Swagger Chromium: owner readiness and safe delivery history with fake-provider acceptance (execution release acceptance)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new EmailFixture(request)
  try {
    const owner = await f.account('OWNER'),
      user = await f.account('CUSTOMER'),
      provider = new RecordingEmailProvider()
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/email/status', 401)
    await authorizeInSwagger(page, owner.token)
    const status = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/email/status',
      200,
    )
    expect(await status.json()).toMatchObject({
      mode: 'disabled',
      providerVerified: false,
    })
    await swaggerExecute(page, 'GET', '/v1/admin/email/templates', 200)
    const eventId = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.email]).queue(f.since, 50, true)
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    const job = await f.db.emailDelivery.findFirstOrThrow({
      where: { eventId },
    })
    const history = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/email/deliveries',
      200,
      undefined,
      undefined,
      { status: 'ACCEPTED' },
    )
    expect((await history.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: job.id, status: 'ACCEPTED' }),
      ]),
    )
    await authorizeInSwagger(page, user.token)
    await swaggerExecute(page, 'GET', '/v1/admin/email/status', 403)
  } finally {
    await f.close()
  }
})
