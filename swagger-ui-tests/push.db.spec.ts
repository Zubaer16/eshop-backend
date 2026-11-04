import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PushFixture } from '../api-tests/push-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'
test('G8 Swagger Chromium: device lifecycle, campaign preview/approval and cancellation without provider calls (execution G12)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new PushFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/push/status', 401)
    await authorizeInSwagger(page, owner.token)
    const status = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/push/status',
      200,
    )
    expect(await status.json()).toMatchObject({
      mode: 'disabled',
      providerVerified: false,
    })
    const deviceResponse = await swaggerExecute(
      page,
      'POST',
      '/v1/notifications/push/devices',
      201,
      {
        expectedRevision: 0,
        installationId: randomUUID(),
        surface: 'ADMIN',
        token: 'swagger-token-' + randomUUID(),
        permission: 'GRANTED',
      },
    )
    const device = await deviceResponse.json()
    await swaggerExecute(page, 'GET', '/v1/notifications/push/devices', 200)
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/push/campaigns',
      201,
      {
        expectedRevision: 0,
        title: 'G8 Browser campaign',
        body: 'Selected new arrivals.',
        audience: 'ALL_OPTED_IN_CUSTOMERS',
        targetType: 'HOME',
        targetId: null,
        imageMediaId: null,
      },
    )
    const campaign = await created.json()
    f.campaignIds.push(campaign.id)
    const preview = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/push/campaigns/{id}/preview',
      200,
      undefined,
      { id: campaign.id },
    )
    expect(await preview.json()).toMatchObject({ providerInvoked: false })
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/push/campaigns/{id}/approve',
      201,
      {
        expectedRevision: 1,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      },
      { id: campaign.id },
    )
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/push/campaigns/{id}/cancel',
      201,
      { expectedRevision: 2 },
      { id: campaign.id },
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/notifications/push/devices/{id}',
      200,
      undefined,
      { id: device.id },
      { expectedRevision: 1 },
    )
  } finally {
    await f.close()
  }
})
