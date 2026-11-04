import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { Environment } from '../config/environment'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../auth/email-verification.crypto'
import {
  activeNotificationStaff,
  resolveNotificationEvent,
} from '../notifications/notification-event'
import { publicPushTarget, pushImage } from './push-targets'
export class PushPolicySkip extends Error {}
type Tx = Prisma.TransactionClient
type Event = {
  id: string
  eventType: string
  payload: Prisma.JsonValue
  createdAt: Date
}
export class PushContent {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  async plan(tx: Tx, event: Event) {
    const c = await resolveNotificationEvent(tx, event)
    const entries: {
      deviceId: string
      deviceRevision: number
      kind: string
      audience: string
      permissionKey: string | null
      title: string
      body: string
      targetType: string
      targetId: string | null
    }[] = []
    if (!c) return entries
    const push = async (
      userId: string,
      audience: string,
      permissionKey: string | null,
    ) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { notificationPreference: true },
      })
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (audience !== 'ADMIN' &&
          user.notificationPreference?.transactionalPush === false) ||
        (audience === 'ADMIN' &&
          (user.role === 'CUSTOMER' ||
            user.notificationPreference?.operationalPush === false))
      )
        return
      const devices = await tx.pushDevice.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          projectId: this.config.get('FCM_PROJECT_ID', { infer: true }),
          surface: audience === 'ADMIN' ? 'ADMIN' : 'STOREFRONT',
          sessionVersion: user.sessionVersion,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, revision: true },
        take: 10,
      })
      for (const device of devices)
        entries.push({
          deviceId: device.id,
          deviceRevision: device.revision,
          kind: c.rule.kind,
          audience,
          permissionKey,
          title:
            audience === 'ADMIN'
              ? 'Store update'
              : audience === 'SECURITY'
                ? 'Account security update'
                : 'Account update',
          body: 'Sign in to view your notification.',
          targetType: c.targetType,
          targetId: c.targetId,
        })
    }
    if (c.customerId)
      await push(
        c.customerId,
        c.type.startsWith('auth.') ? 'SECURITY' : 'CUSTOMER',
        null,
      )
    if (c.permission)
      for (const id of await activeNotificationStaff(tx, c.permission, 'PUSH'))
        await push(id, 'ADMIN', c.permission)
    return entries
  }
  async message(
    tx: Tx,
    job: Prisma.PushDeliveryGetPayload<{
      include: {
        event: true
        campaign: true
        device: {
          include: { user: { include: { notificationPreference: true } } }
        }
        imageMedia: true
      }
    }>,
  ) {
    if (job.createdAt.getTime() < Date.now() - 86400000)
      throw new PushPolicySkip('PUSH_JOB_EXPIRED')
    const device = job.device,
      user = device.user,
      preference = user.notificationPreference
    if (
      device.status !== 'ACTIVE' ||
      device.revision !== job.deviceRevision ||
      device.expiresAt <= new Date() ||
      device.sessionVersion !== user.sessionVersion ||
      device.projectId !== this.config.get('FCM_PROJECT_ID', { infer: true }) ||
      user.status !== 'ACTIVE' ||
      !device.tokenCiphertext
    )
      throw new PushPolicySkip('PUSH_DEVICE_CHANGED_OR_EXPIRED')
    if (
      this.config.get('PUSH_DELIVERY_MODE', { infer: true }) === 'controlled' &&
      !this.config
        .get('PUSH_RECIPIENT_USER_IDS', { infer: true })
        .split(',')
        .includes(user.id)
    )
      throw new PushPolicySkip('PUSH_RECIPIENT_NOT_ALLOWLISTED')
    let path = job.audience === 'ADMIN' ? '/' : '/account'
    if (job.audience === 'MARKETING') {
      if (
        user.role !== 'CUSTOMER' ||
        !preference?.marketingPush ||
        !preference.marketingConsentAt ||
        !job.campaign ||
        !['FANOUT', 'FANOUT_COMPLETE'].includes(job.campaign.status) ||
        device.surface !== 'STOREFRONT'
      )
        throw new PushPolicySkip('CAMPAIGN_OR_CONSENT_CHANGED')
      if (
        job.campaign.audience === 'SELECTED_CUSTOMERS' &&
        !(await tx.pushCampaignAudience.findUnique({
          where: {
            campaignId_userId: { campaignId: job.campaign.id, userId: user.id },
          },
        }))
      )
        throw new PushPolicySkip('CAMPAIGN_AUDIENCE_CHANGED')
      try {
        path = await publicPushTarget(tx, job.targetType, job.targetId)
      } catch {
        throw new PushPolicySkip('PUSH_TARGET_UNAVAILABLE')
      }
    } else {
      const c = await resolveNotificationEvent(tx, job.event)
      if (!c || c.rule.kind !== job.kind)
        throw new PushPolicySkip('PUSH_EVENT_NO_LONGER_ELIGIBLE')
      if (job.audience === 'ADMIN') {
        if (
          device.surface !== 'ADMIN' ||
          !c.permission ||
          !(await activeNotificationStaff(tx, c.permission, 'PUSH')).includes(
            user.id,
          )
        )
          throw new PushPolicySkip('PUSH_PERMISSION_CHANGED')
      } else if (
        device.surface !== 'STOREFRONT' ||
        c.customerId !== user.id ||
        preference?.transactionalPush === false
      )
        throw new PushPolicySkip('PUSH_RECIPIENT_OR_PREFERENCE_CHANGED')
    }
    const image = pushImage(
      job.imageMedia,
      this.config.get('MEDIA_NAMESPACE', { infer: true }),
      job.title,
    )
    if (job.imageMediaId && !image)
      throw new PushPolicySkip('PUSH_IMAGE_UNAVAILABLE')
    let token: string
    try {
      token = decryptEmailActionToken(
        this.config.get('PUSH_TOKEN_ENCRYPTION_KEY', { infer: true }),
        device.tokenCiphertext as unknown as EncryptedActionToken,
        user.id + ':' + device.id + ':' + device.projectId,
      )
    } catch {
      throw new PushPolicySkip('PUSH_TOKEN_DECRYPTION_FAILED')
    }
    let identifierKind: 'REGISTRATION_TOKEN' | 'FID' = 'REGISTRATION_TOKEN'
    if (token.startsWith('{')) {
      try {
        const identifier = JSON.parse(token) as { kind: string; value: string }
        if (
          !['REGISTRATION_TOKEN', 'FID'].includes(identifier.kind) ||
          typeof identifier.value !== 'string'
        )
          throw new Error()
        identifierKind = identifier.kind as typeof identifierKind
        token = identifier.value
      } catch {
        throw new PushPolicySkip('PUSH_IDENTIFIER_INVALID')
      }
    }
    return {
      deliveryId: job.id,
      userId: user.id,
      token,
      identifierKind,
      title: job.title,
      body: job.body,
      targetType: job.targetType,
      link:
        this.config.get(
          job.audience === 'ADMIN'
            ? 'PUSH_ADMIN_ORIGIN'
            : 'PUSH_STOREFRONT_ORIGIN',
          { infer: true },
        ) + path,
      ...(image ? { imageUrl: image.url } : {}),
    }
  }
}
