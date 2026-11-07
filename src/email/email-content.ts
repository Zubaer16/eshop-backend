import { ConfigService } from '@nestjs/config'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../auth/credentials/email-verification.crypto'
import {
  activeNotificationStaff,
  resolveNotificationEvent,
} from '../notifications/notification-event'
import {
  actionKinds,
  emailDefaults,
  EmailPolicySkip,
  recipientHash,
} from './email.policy'
type Tx = Prisma.TransactionClient
type Event = {
  id: string
  eventType: string
  payload: Prisma.JsonValue
  createdAt: Date
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export class EmailContent {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  private async eligible(tx: Tx, userId: string, audience: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { notificationPreference: true },
    })
    if (!user || user.status !== 'ACTIVE') return null
    if (
      audience === 'CUSTOMER' &&
      (!user.emailVerifiedAt ||
        user.notificationPreference?.transactionalEmail === false)
    )
      return null
    if (
      audience === 'ADMIN' &&
      (!user.emailVerifiedAt ||
        user.notificationPreference?.operationalEmail !== true ||
        user.role === 'CUSTOMER')
    )
      return null
    return user
  }
  async action(tx: Tx, event: Event) {
    const p =
      event.payload &&
      typeof event.payload === 'object' &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {}
    if (
      typeof p.userId !== 'string' ||
      !uuid.test(p.userId) ||
      p.eventId !== event.id
    )
      throw new EmailPolicySkip('INVALID_ACTION_REFERENCE')
    const user = await tx.user.findUnique({ where: { id: p.userId } })
    if (!user || user.status !== 'ACTIVE' || user.role !== 'CUSTOMER')
      throw new EmailPolicySkip('ACTION_USER_UNAVAILABLE')
    if (p.recipientHash !== recipientHash(user.email))
      throw new EmailPolicySkip('ACTION_RECIPIENT_CHANGED_OR_LEGACY')
    const verify = event.eventType === 'auth.email_verification.requested'
    const challenge = verify
      ? await tx.emailVerificationChallenge.findUnique({
          where: { userId: user.id },
        })
      : await tx.passwordResetChallenge.findUnique({
          where: { userId: user.id },
        })
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      p.expiresAt !== challenge.expiresAt.toISOString() ||
      (verify && user.emailVerifiedAt)
    )
      throw new EmailPolicySkip('ACTION_EXPIRED_OR_SUPERSEDED')
    let token: string
    try {
      token = decryptEmailActionToken(
        this.config.get('AUTH_ACTION_TOKEN_ENCRYPTION_KEY', { infer: true }),
        p.token as EncryptedActionToken,
        user.id + ':' + event.id,
      )
    } catch {
      throw new EmailPolicySkip('ACTION_DECRYPTION_FAILED')
    }
    const digest = createHash('sha256').update(token).digest()
    if (
      !/^[A-Za-z0-9_-]{64}$/.test(token) ||
      !timingSafeEqual(digest, Buffer.from(challenge.tokenHash, 'hex'))
    )
      throw new EmailPolicySkip('ACTION_EXPIRED_OR_SUPERSEDED')
    return {
      user,
      token,
      kind: verify ? 'EMAIL_VERIFY' : 'PASSWORD_RESET',
      path: verify ? '/verify-email' : '/reset-password',
    }
  }
  async plan(tx: Tx, event: Event) {
    const entries: {
      userId: string
      kind: string
      audience: string
      permissionKey: string | null
      recipientHash: string
      subject: string
      text: string
      templateRevision: number
      targetType: string
      targetId: string | null
    }[] = []
    const push = async (
      userId: string,
      kind: string,
      audience: string,
      permissionKey: string | null,
      targetType: string,
      targetId: string | null,
      variables: Record<string, string>,
    ) => {
      const user = await this.eligible(tx, userId, audience)
      if (!user) return
      const defaults = emailDefaults.find((row) => row.key === kind)
      if (!defaults) throw new Error('EMAIL_KIND_UNAVAILABLE')
      const template = await tx.emailTemplate.findUnique({
        where: { key: kind },
      })
      const render = (value: string) =>
        value.replace(
          /\{(orderId|productId)\}/g,
          (_, key: string) => variables[key] ?? '',
        )
      const subject =
        audience === 'ADMIN' && kind === 'ORDER_PLACED'
          ? 'New order'
          : render(template?.subject ?? defaults.subject)
      const text =
        audience === 'ADMIN' && kind === 'ORDER_PLACED'
          ? 'A new order ' + variables.orderId + ' was placed.'
          : render(template?.text ?? defaults.text)
      entries.push({
        userId,
        kind,
        audience,
        permissionKey,
        recipientHash: recipientHash(user.email),
        subject: subject.slice(0, 160),
        text: text.slice(0, 1800),
        templateRevision: template?.revision ?? 0,
        targetType,
        targetId,
      })
    }
    if (
      event.eventType === 'auth.email_verification.requested' ||
      event.eventType === 'auth.password_reset.requested'
    ) {
      const action = await this.action(tx, event)
      await push(
        action.user.id,
        action.kind,
        'SECURITY',
        null,
        'HOME',
        null,
        {},
      )
    } else {
      const c = await resolveNotificationEvent(tx, event)
      if (!c) return entries
      if (c.customerId)
        await push(
          c.customerId,
          c.rule.kind,
          c.type.startsWith('auth.') ? 'SECURITY' : 'CUSTOMER',
          null,
          c.targetType,
          c.targetId,
          c.variables,
        )
      if (c.permission)
        for (const id of await activeNotificationStaff(
          tx,
          c.permission,
          'EMAIL',
        ))
          await push(
            id,
            c.rule.kind,
            'ADMIN',
            c.permission,
            c.targetType,
            c.targetId,
            c.variables,
          )
    }
    return entries
  }
  async message(
    tx: Tx,
    job: Prisma.EmailDeliveryGetPayload<{ include: { event: true } }>,
  ) {
    const user = await this.eligible(tx, job.userId, job.audience)
    if (!user || recipientHash(user.email) !== job.recipientHash)
      throw new EmailPolicySkip('RECIPIENT_OR_PREFERENCE_CHANGED')
    const mode = this.config.get('EMAIL_DELIVERY_MODE', { infer: true })
    if (
      mode === 'controlled' &&
      !this.config
        .get('EMAIL_RECIPIENT_ALLOWLIST', { infer: true })
        .split(',')
        .includes(user.email.toLowerCase())
    )
      throw new EmailPolicySkip('RECIPIENT_NOT_ALLOWLISTED')
    let suffix = ''
    if (actionKinds.includes(job.kind)) {
      const action = await this.action(tx, job.event)
      if (action.user.id !== job.userId || action.kind !== job.kind)
        throw new EmailPolicySkip('ACTION_JOB_MISMATCH')
      suffix =
        this.config.get('EMAIL_PUBLIC_ORIGIN', { infer: true }) +
        action.path +
        '#token=' +
        encodeURIComponent(action.token)
    } else {
      const c = await resolveNotificationEvent(tx, job.event)
      if (!c || c.rule.kind !== job.kind)
        throw new EmailPolicySkip('EVENT_NO_LONGER_ELIGIBLE')
      if (job.audience === 'ADMIN') {
        if (
          !c.permission ||
          !(await activeNotificationStaff(tx, c.permission, 'EMAIL')).includes(
            user.id,
          )
        )
          throw new EmailPolicySkip('STAFF_PERMISSION_CHANGED')
        suffix = this.config.get('EMAIL_ADMIN_ORIGIN', { infer: true }) + '/'
      } else {
        if (c.customerId !== user.id)
          throw new EmailPolicySkip('RECIPIENT_CHANGED')
        suffix =
          this.config.get('EMAIL_PUBLIC_ORIGIN', { infer: true }) +
          (c.targetType === 'ORDER' || c.targetType === 'TRACKING'
            ? '/account/orders/' + c.targetId
            : '/account')
      }
    }
    return {
      deliveryId: job.id,
      to: user.email,
      subject: job.subject,
      text:
        job.text +
        '\n\n' +
        suffix +
        '\n\nIf you did not request this action, contact store support. Sign in directly to review your account.',
    }
  }
}
