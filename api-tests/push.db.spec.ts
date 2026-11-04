import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'
import {
  PushFixture,
  RecordingPushProvider,
  bearer,
  expect,
} from './push-test-support'
import { preferenceInput } from './notifications-test-support'
import { PushSubmissionError } from '../src/push/push.provider'

test('G8 DB: encrypted owned web registration, heartbeat, rotation, stale revision and revoke (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      device = await f.device(user)
    const stored = await f.db.pushDevice.findUniqueOrThrow({
      where: { id: device.id },
    })
    expect(JSON.stringify(stored)).not.toContain(device.rawToken)
    const list = await request.get('/v1/notifications/push/devices', {
      headers: bearer(user.token),
    })
    expect(list.status()).toBe(200)
    expect(JSON.stringify(await list.json())).not.toMatch(
      /tokenHash|tokenCiphertext|fixture-fcm|sessionVersion/,
    )
    expect(
      (
        await f.device(
          user,
          'STOREFRONT',
          device.installationId,
          device.rawToken,
          1,
        )
      ).revision,
    ).toBe(1)
    const changed = await f.device(
      user,
      'STOREFRONT',
      device.installationId,
      'rotated-token-' + randomUUID(),
      1,
    )
    expect(changed.revision).toBe(2)
    expect(
      (
        await request.post('/v1/notifications/push/devices', {
          headers: bearer(user.token),
          data: {
            expectedRevision: 1,
            installationId: device.installationId,
            surface: 'STOREFRONT',
            token: 'stale-token-' + randomUUID(),
            permission: 'GRANTED',
          },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.delete('/v1/notifications/push/devices/' + device.id, {
          headers: bearer(user.token),
          params: { expectedRevision: 2 },
        })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.pushDevice.findUnique({ where: { id: device.id } }),
    ).toMatchObject({ status: 'REVOKED', revision: 3, tokenCiphertext: null })
  } finally {
    await f.close()
  }
})

test('G8 DB: independent event subscriber, generic private push, concurrency and authenticated target isolation (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      other = await f.account('CUSTOMER'),
      device = await f.device(user),
      provider = new RecordingPushProvider()
    const eventId = await f.event('auth.password_changed', { userId: user.id })
    await Promise.all([
      f.queue([user.id]).queue(f.since, 50, true),
      f.queue([user.id]).queue(f.since, 50, true),
    ])
    expect(await f.db.pushDelivery.count({ where: { eventId } })).toBe(1)
    await Promise.all([
      f.sender([user.id], provider).dispatch(f.since, 50, true),
      f.sender([user.id], provider).dispatch(f.since, 50, true),
    ])
    expect(provider.messages).toHaveLength(1)
    expect(provider.messages[0]).toMatchObject({
      token: device.rawToken,
      title: 'Account security update',
      body: 'Sign in to view your notification.',
      link: 'https://store.example.test/account',
    })
    const job = await f.db.pushDelivery.findFirstOrThrow({ where: { eventId } })
    expect(job).toMatchObject({ status: 'ACCEPTED', attempts: 1 })
    expect(
      await f.db.outboxEvent.findUnique({ where: { id: eventId } }),
    ).toMatchObject({ status: 'PENDING', attempts: 0 })
    expect(
      await (
        await request.get(
          '/v1/notifications/push/deliveries/' + job.id + '/target',
          { headers: bearer(user.token) },
        )
      ).json(),
    ).toEqual({ targetType: 'HOME', targetId: null, surface: 'STOREFRONT' })
    expect(
      (
        await request.get(
          '/v1/notifications/push/deliveries/' + job.id + '/target',
          { headers: bearer(other.token) },
        )
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})

test('G8 DB: invalid registration cleanup, stale token fencing, preference/allowlist and uncertain recovery (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      device = await f.device(user),
      provider = new RecordingPushProvider()
    const eventId = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.id]).queue(f.since, 50, true)
    provider.failure = new PushSubmissionError(
      'INVALID_TOKEN',
      'FCM_TOKEN_UNREGISTERED',
    )
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.pushDevice.findUnique({ where: { id: device.id } }),
    ).toMatchObject({ status: 'INVALID', revision: 2, tokenCiphertext: null })
    expect(
      await f.db.pushDelivery.findFirst({ where: { eventId } }),
    ).toMatchObject({
      status: 'REJECTED',
      failureCode: 'FCM_TOKEN_UNREGISTERED',
    })
    await f.device(
      user,
      'STOREFRONT',
      device.installationId,
      'fresh-token-' + randomUUID(),
      2,
    )
    const second = await f.event('auth.password_reset.completed', {
      userId: user.id,
    })
    await f.queue([user.id]).queue(f.since, 50, true)
    provider.failure = new PushSubmissionError(
      'UNCERTAIN',
      'FCM_SUBMISSION_UNCERTAIN',
    )
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.pushDelivery.findFirst({ where: { eventId: second } }),
    ).toMatchObject({ status: 'REQUIRES_REVIEW', attempts: 1 })
    const calls = provider.calls
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(calls)
    const third = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.id]).queue(f.since, 50, true)
    await request.put('/v1/notifications/preferences', {
      headers: bearer(user.token),
      data: preferenceInput,
    })
    provider.failure = null
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.pushDelivery.findFirst({ where: { eventId: third } }),
    ).toMatchObject({
      status: 'SKIPPED',
      failureCode: 'PUSH_RECIPIENT_OR_PREFERENCE_CHANGED',
    })
  } finally {
    await f.close()
  }
})

test('G8 DB: scheduled selected audience, consent, rich inbox publication, replay-safe campaign fanout and metrics (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const owner = await f.account('OWNER'),
      user = await f.account('CUSTOMER'),
      excluded = await f.account('CUSTOMER'),
      headers = bearer(owner.token)
    await f.device(user)
    await f.device(excluded)
    for (const customer of [user, excluded])
      expect(
        (
          await request.put('/v1/notifications/preferences', {
            headers: bearer(customer.token),
            data: {
              ...preferenceInput,
              marketingInApp: true,
              marketingPush: true,
            },
          })
        ).status(),
      ).toBe(200)
    const mediaId = await f.diskAsset(owner.token),
      campaign = await f.campaign(owner, {
        audience: 'SELECTED_CUSTOMERS',
        selectedUserIds: [user.id],
        imageMediaId: mediaId,
      })
    expect((await request.get('/v1/media/files/' + mediaId)).status()).toBe(404)
    const preview = await request.get(
      '/v1/admin/push/campaigns/' + campaign.id + '/preview',
      { headers },
    )
    expect(await preview.json()).toMatchObject({
      eligibleCustomers: 1,
      eligibleDevices: 1,
      providerInvoked: false,
    })
    expect(
      (
        await request.delete('/v1/admin/media/' + mediaId, { headers })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(
          '/v1/admin/push/campaigns/' + campaign.id + '/approve',
          {
            headers,
            data: {
              expectedRevision: 1,
              scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        )
      ).status(),
    ).toBe(201)
    expect((await f.campaigns([user.id]).fanout(1, true)).recipients).toBe(0)
    await f.db.pushCampaign.update({
      where: { id: campaign.id },
      data: { scheduledAt: new Date(0) },
    })
    await Promise.all([
      f.campaigns([user.id]).fanout(1, true),
      f.campaigns([user.id]).fanout(1, true),
    ])
    await f.campaigns([user.id]).fanout(1, true)
    expect(
      await f.db.pushCampaignRecipient.count({
        where: { campaignId: campaign.id },
      }),
    ).toBe(1)
    expect(
      await f.db.pushDelivery.count({ where: { campaignId: campaign.id } }),
    ).toBe(1)
    expect(
      await f.db.notificationRecipient.count({
        where: {
          userId: excluded.id,
          notification: { campaignId: campaign.id },
        },
      }),
    ).toBe(0)
    const inbox = await (
      await request.get('/v1/notifications', { headers: bearer(user.token) })
    ).json()
    expect(inbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          audience: 'MARKETING',
          image: expect.objectContaining({ id: mediaId }),
        }),
      ]),
    )
    expect((await request.get('/v1/media/files/' + mediaId)).status()).toBe(200)
    const provider = new RecordingPushProvider()
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(provider.messages).toHaveLength(1)
    expect(provider.messages[0]!.imageUrl).toContain(
      '/v1/media/files/' + mediaId,
    )
    expect(
      await (
        await request.get(
          '/v1/admin/push/campaigns/' + campaign.id + '/metrics',
          { headers },
        )
      ).json(),
    ).toMatchObject({
      fanoutComplete: true,
      recipientsProcessed: 1,
      inAppCreated: 1,
      pushQueued: 1,
      accepted: 1,
      deviceDeliveryVerified: false,
    })
    await request.put('/v1/notifications/preferences', {
      headers: bearer(user.token),
      data: { ...preferenceInput, expectedRevision: 1 },
    })
    expect(
      await (
        await request.get('/v1/notifications', { headers: bearer(user.token) })
      ).json(),
    ).toMatchObject({ total: 0 })
  } finally {
    await f.close()
  }
})

test('G8 DB: approval freezes campaign copy; cancellation and withdrawn consent suppress pending sends (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const owner = await f.account('OWNER'),
      user = await f.account('CUSTOMER'),
      headers = bearer(owner.token)
    await f.device(user)
    await request.put('/v1/notifications/preferences', {
      headers: bearer(user.token),
      data: { ...preferenceInput, marketingPush: true },
    })
    const campaign = await f.campaign(owner)
    expect(
      (
        await request.post(
          '/v1/admin/push/campaigns/' + campaign.id + '/approve',
          { headers, data: { expectedRevision: 1 } },
        )
      ).status(),
    ).toBe(201)
    expect(
      (
        await request.put('/v1/admin/push/campaigns/' + campaign.id, {
          headers,
          data: {
            ...campaign.input,
            expectedRevision: 2,
            title: 'Changed after approval',
          },
        })
      ).status(),
    ).toBe(409)
    await f.campaigns([user.id]).fanout(50, true)
    expect(
      (
        await request.post(
          '/v1/admin/push/campaigns/' + campaign.id + '/cancel',
          { headers, data: { expectedRevision: 2 } },
        )
      ).status(),
    ).toBe(201)
    const provider = new RecordingPushProvider()
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(0)
    expect(
      await f.db.pushDelivery.findFirst({ where: { campaignId: campaign.id } }),
    ).toMatchObject({
      status: 'SKIPPED',
      failureCode: 'CAMPAIGN_OR_CONSENT_CHANGED',
    })
  } finally {
    await f.close()
  }
})

test('G8 DB: known failures exhaust at five attempts and abandoned leases enter review without resubmission (G12)', async ({
  request,
}) => {
  const f = new PushFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      provider = new RecordingPushProvider()
    await f.device(user)
    const eventId = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.id]).queue(f.since, 50, true)
    const job = await f.db.pushDelivery.findFirstOrThrow({ where: { eventId } })
    provider.failure = new PushSubmissionError(
      'RETRYABLE',
      'FCM_TEMPORARY_REJECTION',
      120,
    )
    for (let i = 1; i <= 5; i++) {
      await f.db.pushDelivery.update({
        where: { id: job.id },
        data: { nextAttemptAt: new Date(0) },
      })
      await f.sender([user.id], provider).dispatch(f.since, 50, true)
    }
    expect(
      await f.db.pushDelivery.findUnique({ where: { id: job.id } }),
    ).toMatchObject({ status: 'REJECTED', attempts: 5 })
    expect(
      await f.db.pushDeliveryAttempt.count({ where: { deliveryId: job.id } }),
    ).toBe(5)
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(5)
    const other = await f.event('auth.password_reset.completed', {
      userId: user.id,
    })
    await f.queue([user.id]).queue(f.since, 50, true)
    const abandoned = await f.db.pushDelivery.findFirstOrThrow({
      where: { eventId: other },
    })
    await f.db.$transaction(async (tx) => {
      await tx.pushDelivery.update({
        where: { id: abandoned.id },
        data: {
          status: 'PROCESSING',
          attempts: 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(0),
        },
      })
      await tx.pushDeliveryAttempt.create({
        data: { deliveryId: abandoned.id, number: 1, status: 'STARTED' },
      })
    })
    await f.sender([user.id], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.pushDelivery.findUnique({ where: { id: abandoned.id } }),
    ).toMatchObject({
      status: 'REQUIRES_REVIEW',
      failureCode: 'FCM_WORKER_INTERRUPTED',
    })
    expect(provider.calls).toBe(5)
  } finally {
    await f.close()
  }
})
