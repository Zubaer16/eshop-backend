import { expect, test } from '@playwright/test'
import {
  NotificationsFixture,
  preferenceInput,
} from '../api-tests/notifications-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'
test('G6 Swagger Chromium: inbox preferences, security notification and owned read/target (execution G12)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new NotificationsFixture(request)
  try {
    const user = await f.account('CUSTOMER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/notifications', 401)
    await authorizeInSwagger(page, user.token)
    const defaults = await swaggerExecute(
      page,
      'GET',
      '/v1/notifications/preferences',
      200,
    )
    expect(await defaults.json()).toMatchObject({
      revision: 0,
      marketingEmail: false,
    })
    await swaggerExecute(
      page,
      'PUT',
      '/v1/notifications/preferences',
      200,
      preferenceInput,
    )
    await swaggerExecute(
      page,
      'PUT',
      '/v1/notifications/preferences',
      409,
      preferenceInput,
    )
    await f.event('auth.password_changed', { userId: user.id })
    await f.dispatcher().dispatch(f.since, 50, true)
    const inbox = await swaggerExecute(page, 'GET', '/v1/notifications', 200)
    const data = await inbox.json()
    expect(data.unread).toBe(1)
    const id = data.items[0].id
    await swaggerExecute(
      page,
      'PUT',
      '/v1/notifications/{id}/read',
      200,
      { read: true },
      { id },
    )
    const target = await swaggerExecute(
      page,
      'GET',
      '/v1/notifications/{id}/target',
      200,
      undefined,
      { id },
    )
    expect(await target.json()).toEqual({ targetType: 'HOME', targetId: null })
    await swaggerExecute(page, 'GET', '/v1/admin/notifications/templates', 403)
  } finally {
    await f.close()
  }
})
