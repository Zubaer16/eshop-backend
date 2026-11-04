import { publicPushTarget, pushImage } from '../push/push-targets'
import { ConfigService } from '@nestjs/config'
import { Environment } from '../config/environment'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import type { AuthenticatedRequest } from '../auth/auth.types'
import {
  notificationRules,
  preferenceDefaults,
  validateTemplate,
} from './notifications.policy'
import {
  NotificationQueryDto,
  SaveNotificationPreferencesDto,
  SaveNotificationTemplateDto,
} from './notifications.dto'

type Actor = NonNullable<AuthenticatedRequest['authUser']>
const include = { notification: { include: { imageMedia: true } } } as const
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  private visible(actor: Actor): Prisma.NotificationRecipientWhereInput {
    const permissions =
      actor.role === 'CUSTOMER' ? [] : (actor.permissions ?? [])
    return {
      userId: actor.id,
      OR: [
        { notification: { audience: 'SECURITY' } },
        { notification: { audience: 'CUSTOMER', targetId: { not: null } } },
        ...(actor.role !== 'CUSTOMER'
          ? [
              {
                notification: {
                  audience: 'ADMIN',
                  ...(actor.role === 'OWNER'
                    ? {}
                    : { permissionKey: { in: permissions } }),
                },
              },
            ]
          : []),
        {
          notification: { audience: 'MARKETING' },
          user: {
            role: 'CUSTOMER',
            notificationPreference: {
              is: { marketingInApp: true, marketingConsentAt: { not: null } },
            },
          },
        },
      ],
    }
  }
  private item(
    row: Prisma.NotificationRecipientGetPayload<{ include: typeof include }>,
  ) {
    const n = row.notification
    return {
      id: row.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      audience: n.audience,
      targetType: n.targetType,
      targetId: n.targetId,
      image: pushImage(
        n.imageMedia,
        this.config.get('MEDIA_NAMESPACE', { infer: true }),
        n.title,
      ),
      readAt: row.readAt,
      createdAt: row.createdAt,
    }
  }
  async inbox(actor: Actor, query: NotificationQueryDto) {
    const visible = this.visible(actor),
      page = query.page ?? 1,
      limit = query.limit ?? 20
    const where = {
      ...visible,
      ...(query.readState === 'unread' ? { readAt: null } : {}),
    }
    const [rows, total, unread] = await this.db.client.$transaction(
      [
        this.db.client.notificationRecipient.findMany({
          where,
          include,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.db.client.notificationRecipient.count({ where }),
        this.db.client.notificationRecipient.count({
          where: { ...visible, readAt: null },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    return {
      items: rows.map((row) => this.item(row)),
      total,
      unread,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }
  async read(actor: Actor, id: string, read: boolean) {
    const row = await this.db.client.notificationRecipient.findFirst({
      where: { ...this.visible(actor), id },
      include,
    })
    if (!row) throw new NotFoundException('Notification not found')
    await this.db.client.notificationRecipient.updateMany({
      where: { id, userId: actor.id, ...(read ? { readAt: null } : {}) },
      data: { readAt: read ? new Date() : null },
    })
    return this.item(
      await this.db.client.notificationRecipient.findUniqueOrThrow({
        where: { id },
        include,
      }),
    )
  }
  async readAll(actor: Actor, before: Date) {
    const result = await this.db.client.notificationRecipient.updateMany({
      where: {
        ...this.visible(actor),
        readAt: null,
        createdAt: { lte: before },
      },
      data: { readAt: new Date() },
    })
    return { changed: result.count }
  }
  async target(actor: Actor, id: string) {
    const row = await this.db.client.notificationRecipient.findFirst({
      where: { ...this.visible(actor), id },
      include,
    })
    if (!row) throw new NotFoundException('Notification not found')
    const n = row.notification
    if (n.audience === 'MARKETING')
      await publicPushTarget(this.db.client, n.targetType, n.targetId)
    if (n.targetType === 'ORDER' || n.targetType === 'TRACKING') {
      const order = await this.db.client.order.findUnique({
        where: { id: n.targetId! },
        select: { customerId: true },
      })
      if (
        !order ||
        (n.audience === 'CUSTOMER' && order.customerId !== actor.id)
      )
        throw new NotFoundException('Target not found')
    } else if (
      n.targetType === 'PRODUCT' &&
      !(await this.db.client.product.findUnique({
        where: { id: n.targetId! },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Target not found')
    return { targetType: n.targetType, targetId: n.targetId }
  }
  private preferences(
    row:
      | typeof preferenceDefaults
      | Prisma.NotificationPreferenceGetPayload<Record<string, never>>,
  ) {
    return {
      revision: row.revision,
      transactionalEmail: row.transactionalEmail,
      transactionalPush: row.transactionalPush,
      operationalInApp: row.operationalInApp,
      operationalEmail: row.operationalEmail,
      operationalPush: row.operationalPush,
      marketingInApp: row.marketingInApp,
      marketingEmail: row.marketingEmail,
      marketingPush: row.marketingPush,
      marketingConsentAt: row.marketingConsentAt,
      securityEmailRequired: true,
      transactionalInAppRequired: true,
    }
  }
  async getPreferences(userId: string) {
    return this.preferences(
      (await this.db.client.notificationPreference.findUnique({
        where: { userId },
      })) ?? preferenceDefaults,
    )
  }
  async savePreferences(userId: string, dto: SaveNotificationPreferencesDto) {
    const { expectedRevision, ...flags } = dto
    try {
      return await this.db.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
        const prior = await tx.notificationPreference.findUnique({
          where: { userId },
        })
        if ((prior?.revision ?? 0) !== expectedRevision)
          throw new ConflictException('Preferences changed. Reload and retry.')
        const marketing =
          flags.marketingEmail || flags.marketingPush || flags.marketingInApp
        const wasMarketing =
          prior &&
          (prior.marketingEmail || prior.marketingPush || prior.marketingInApp)
        const values = {
          ...flags,
          marketingConsentAt: marketing
            ? wasMarketing
              ? (prior.marketingConsentAt ?? new Date())
              : new Date()
            : null,
        }
        const saved = await tx.notificationPreference.upsert({
          where: { userId },
          create: { userId, ...values },
          update: { ...values, revision: { increment: 1 } },
        })
        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: 'notifications.preferences.saved',
            targetType: 'user',
            targetId: userId,
          },
        })
        return this.preferences(saved)
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException('Preferences changed')
      throw error
    }
  }
  async templates() {
    const stored = await this.db.client.notificationTemplate.findMany()
    return Object.values(notificationRules).map((rule) => {
      const override = stored.find((row) => row.key === rule.kind)
      return {
        key: rule.kind,
        title: override?.title ?? rule.title,
        body: override?.body ?? rule.body,
        revision: override?.revision ?? 0,
      }
    })
  }
  async saveTemplate(
    key: string,
    dto: SaveNotificationTemplateDto,
    actorId: string,
  ) {
    if (!Object.values(notificationRules).some((rule) => rule.kind === key))
      throw new NotFoundException('Template not found')
    const title = validateTemplate(dto.title, 160),
      body = validateTemplate(dto.body, 600)
    const rule = Object.values(notificationRules).find(
      (item) => item.kind === key,
    )!
    const allowed =
      rule.target === 'PRODUCT'
        ? 'productId'
        : rule.target === 'HOME'
          ? ''
          : 'orderId'
    if (
      [...title.matchAll(/\{(\w+)\}/g), ...body.matchAll(/\{(\w+)\}/g)].some(
        (match) => match[1] !== allowed,
      )
    )
      throw new BadRequestException(
        'Placeholder is unavailable for this event kind',
      )
    try {
      return await this.db.client.$transaction(async (tx) => {
        if (dto.expectedRevision === 0) {
          await tx.notificationTemplate.create({ data: { key, title, body } })
        } else {
          const result = await tx.notificationTemplate.updateMany({
            where: { key, revision: dto.expectedRevision },
            data: { title, body, revision: { increment: 1 } },
          })
          if (result.count !== 1)
            throw new ConflictException('Template changed. Reload and retry.')
        }
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'notifications.template.saved',
            targetType: 'notification_template',
            targetId: key,
          },
        })
        const row = await tx.notificationTemplate.findUniqueOrThrow({
          where: { key },
        })
        return {
          key: row.key,
          title: row.title,
          body: row.body,
          revision: row.revision,
        }
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Template already overridden')
      throw error
    }
  }
  async failures(query: NotificationQueryDto) {
    const rows = await this.db.client.notificationEventReceipt.findMany({
      where: { status: 'FAILED' },
      include: { event: { select: { eventType: true } } },
      orderBy: [{ updatedAt: 'desc' }, { eventId: 'asc' }],
      take: query.limit ?? 20,
      skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
    })
    return rows.map((row) => ({
      eventId: row.eventId,
      eventType: row.event.eventType,
      attempts: row.attempts,
      failureCode: row.failureCode,
      nextAttemptAt: row.nextAttemptAt,
      exhausted: row.attempts >= 10,
    }))
  }
}
