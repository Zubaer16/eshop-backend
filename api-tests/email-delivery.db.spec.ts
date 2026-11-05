import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'
import {
  EmailFixture,
  RecordingEmailProvider,
  expect,
  bearer,
} from './email-delivery-test-support'
import { preferenceInput } from './notifications-test-support'
import { EmailSubmissionError } from '../src/email/email.provider'

test('email delivery DB: encrypted action to unique email job, concurrent submission, accepted state and one-time verification (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      headers = bearer(user.token),
      provider = new RecordingEmailProvider()
    expect(
      (
        await request.post('/v1/auth/email-verification/request', { headers })
      ).status(),
    ).toBe(202)
    const event = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'auth.email_verification.requested',
        payload: { path: ['userId'], equals: user.id },
      },
    })
    f.eventIds.push(event.id)
    await Promise.all([
      f.queue([user.email]).queue(f.since, 50, true),
      f.queue([user.email]).queue(f.since, 50, true),
    ])
    expect(
      await f.db.emailDelivery.count({ where: { eventId: event.id } }),
    ).toBe(1)
    const job = await f.db.emailDelivery.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(JSON.stringify(job)).not.toContain(user.email)
    expect(JSON.stringify(job)).not.toContain('#token=')
    await Promise.all([
      f.sender([user.email], provider).dispatch(f.since, 50, true),
      f.sender([user.email], provider).dispatch(f.since, 50, true),
    ])
    expect(provider.messages).toHaveLength(1)
    expect(provider.messages[0]!.to).toBe(user.email)
    const link = provider.messages[0]!.text.split('\n').find((line) =>
      line.startsWith('https://shop.example.test/verify-email#token='),
    )!
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')!
    expect(token).toHaveLength(64)
    expect(
      JSON.stringify(
        await f.db.emailDelivery.findUnique({ where: { id: job.id } }),
      ),
    ).not.toContain(token)
    expect(
      await f.db.emailDelivery.findUnique({ where: { id: job.id } }),
    ).toMatchObject({
      status: 'ACCEPTED',
      attempts: 1,
      leaseToken: null,
      acceptedAt: expect.any(Date),
    })
    expect(
      await f.db.outboxEvent.findUnique({ where: { id: event.id } }),
    ).toMatchObject({ status: 'PENDING', attempts: 0 })
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token },
        })
      ).status(),
    ).toBe(400)
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .emailVerifiedAt,
    ).not.toBeNull()
  } finally {
    await f.close()
  }
})

test('email delivery DB: consumed/replaced/legacy action tokens are suppressed before SMTP (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      headers = bearer(user.token),
      provider = new RecordingEmailProvider()
    await request.post('/v1/auth/email-verification/request', { headers })
    const event = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'auth.email_verification.requested',
        payload: { path: ['userId'], equals: user.id },
      },
    })
    f.eventIds.push(event.id)
    await f.queue([user.email]).queue(f.since, 50, true)
    await f.db.emailVerificationChallenge.update({
      where: { userId: user.id },
      data: { consumedAt: new Date() },
    })
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(0)
    expect(
      await f.db.emailDelivery.findFirst({ where: { eventId: event.id } }),
    ).toMatchObject({
      status: 'SKIPPED',
      failureCode: 'ACTION_EXPIRED_OR_SUPERSEDED',
    })
    const legacy = await f.event('auth.password_reset.requested', {
      userId: user.id,
      eventId: randomUUID(),
    })
    await f.queue([user.email]).queue(f.since, 50, true)
    expect(
      await f.db.emailEventReceipt.findUnique({ where: { eventId: legacy } }),
    ).toMatchObject({
      status: 'SKIPPED',
      failureCode: 'INVALID_ACTION_REFERENCE',
    })
  } finally {
    await f.close()
  }
})

test('email delivery DB: mandatory security, controlled allowlist and independent operational email opt-in (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      owner = await f.account('OWNER'),
      provider = new RecordingEmailProvider()
    await request.put('/v1/notifications/preferences', {
      headers: bearer(user.token),
      data: preferenceInput,
    })
    const security = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.email]).queue(f.since, 50, true)
    await f
      .sender(['different@example.test'], provider)
      .dispatch(f.since, 50, true)
    expect(provider.calls).toBe(0)
    expect(
      await f.db.emailDelivery.findFirst({ where: { eventId: security } }),
    ).toMatchObject({
      status: 'SKIPPED',
      failureCode: 'RECIPIENT_NOT_ALLOWLISTED',
    })
    const second = await f.event('auth.password_reset.completed', {
      userId: user.id,
    })
    await f.queue([user.email]).queue(f.since, 50, true)
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.messages).toHaveLength(1)
    expect(
      await f.db.emailDelivery.findFirst({ where: { eventId: second } }),
    ).toMatchObject({ status: 'ACCEPTED' })
    await f.db.user.update({
      where: { id: owner.id },
      data: { emailVerifiedAt: new Date() },
    })
    await request.put('/v1/notifications/preferences', {
      headers: bearer(owner.token),
      data: {
        ...preferenceInput,
        operationalInApp: false,
        operationalEmail: true,
      },
    })
    const ops = await f.event('payment.test_review_required', {
      providerEventId: 'test-operational',
    })
    await f.queue([owner.email]).queue(f.since, 50, true)
    expect(
      await f.db.emailDelivery.findFirst({
        where: { eventId: ops, userId: owner.id },
      }),
    ).toMatchObject({ audience: 'ADMIN' })
    expect(await f.db.notification.count({ where: { eventId: ops } })).toBe(0)
    await f.sender([owner.email], provider).dispatch(f.since, 50, true)
    expect(
      provider.messages.some((message) => message.to === owner.email),
    ).toBe(true)
  } finally {
    await f.close()
  }
})

test('email delivery DB: backoff, uncertain SMTP results and abandoned leases never automatically resubmit (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      provider = new RecordingEmailProvider()
    const id = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.email]).queue(f.since, 50, true)
    provider.failure = new EmailSubmissionError(
      'RETRYABLE',
      'SMTP_CONNECTION_FAILED',
    )
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    const job = await f.db.emailDelivery.findFirstOrThrow({
      where: { eventId: id },
    })
    expect(job).toMatchObject({ status: 'FAILED', attempts: 1 })
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(1)
    await f.db.emailDelivery.update({
      where: { id: job.id },
      data: { nextAttemptAt: new Date(0) },
    })
    provider.failure = new EmailSubmissionError(
      'UNCERTAIN',
      'SMTP_SUBMISSION_UNCERTAIN',
    )
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.emailDelivery.findUnique({ where: { id: job.id } }),
    ).toMatchObject({ status: 'REQUIRES_REVIEW', attempts: 2 })
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(2)
    const other = await f.event('auth.password_reset.completed', {
      userId: user.id,
    })
    await f.queue([user.email]).queue(f.since, 50, true)
    const abandoned = await f.db.emailDelivery.findFirstOrThrow({
      where: { eventId: other },
    })
    await f.db.$transaction(async (tx) => {
      await tx.emailDelivery.update({
        where: { id: abandoned.id },
        data: {
          status: 'PROCESSING',
          attempts: 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(0),
        },
      })
      await tx.emailDeliveryAttempt.create({
        data: { deliveryId: abandoned.id, number: 1, status: 'STARTED' },
      })
    })
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(
      await f.db.emailDelivery.findUnique({ where: { id: abandoned.id } }),
    ).toMatchObject({
      status: 'REQUIRES_REVIEW',
      failureCode: 'SMTP_WORKER_INTERRUPTED',
    })
    expect(provider.calls).toBe(2)
  } finally {
    await f.close()
  }
})

test('email delivery DB: password recovery reaches fake provider, resets once and revokes the previous session (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      provider = new RecordingEmailProvider()
    expect(
      (
        await request.post('/v1/auth/password-reset/request', {
          data: { email: user.email },
        })
      ).status(),
    ).toBe(202)
    await f.queue([user.email]).queue(f.since, 50, true)
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.messages).toHaveLength(1)
    const link = provider.messages[0]!.text.split('\n').find((line) =>
      line.startsWith('https://shop.example.test/reset-password#token='),
    )!
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get(
        'token',
      )!,
      newPassword = 'email delivery-Recovered-password-2!'
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token, newPassword },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token, newPassword },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.get('/v1/auth/me', { headers: bearer(user.token) })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: user.email, password: newPassword },
        })
      ).status(),
    ).toBe(200)
  } finally {
    await f.close()
  }
})

test('email delivery DB: known pre-submission failures stop after five attempts with durable history (release acceptance)', async ({
  request,
}) => {
  const f = new EmailFixture(request)
  try {
    const user = await f.account('CUSTOMER'),
      provider = new RecordingEmailProvider()
    provider.failure = new EmailSubmissionError(
      'RETRYABLE',
      'SMTP_CONNECTION_FAILED',
    )
    const eventId = await f.event('auth.password_changed', { userId: user.id })
    await f.queue([user.email]).queue(f.since, 50, true)
    const job = await f.db.emailDelivery.findFirstOrThrow({
      where: { eventId },
    })
    for (let attempt = 1; attempt <= 5; attempt++) {
      await f.db.emailDelivery.update({
        where: { id: job.id },
        data: { nextAttemptAt: new Date(0) },
      })
      await f.sender([user.email], provider).dispatch(f.since, 50, true)
    }
    expect(
      await f.db.emailDelivery.findUnique({ where: { id: job.id } }),
    ).toMatchObject({ status: 'REJECTED', attempts: 5 })
    expect(
      await f.db.emailDeliveryAttempt.count({ where: { deliveryId: job.id } }),
    ).toBe(5)
    await f.sender([user.email], provider).dispatch(f.since, 50, true)
    expect(provider.calls).toBe(5)
  } finally {
    await f.close()
  }
})
