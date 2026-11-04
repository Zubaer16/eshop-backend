import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { emailText } from '../email/email.policy'
import {
  ApprovePushCampaignDto,
  PushPagingDto,
  SavePushCampaignDto,
} from './push.dto'
import { lockPushImage, publicPushTarget, pushImage } from './push-targets'
const include = {
  imageMedia: true,
  selected: { select: { userId: true }, orderBy: { userId: 'asc' as const } },
} as const
@Injectable()
export class PushCampaignsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  private present(
    row: Prisma.PushCampaignGetPayload<{ include: typeof include }>,
  ) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      audience: row.audience,
      status: row.status,
      revision: row.revision,
      targetType: row.targetType,
      targetId: row.targetId,
      imageMediaId: row.imageMediaId,
      image: pushImage(
        row.imageMedia,
        this.config.get('MEDIA_NAMESPACE', { infer: true }),
        row.title,
      ),
      selectedUserIds: row.selected.map((r) => r.userId),
      scheduledAt: row.scheduledAt,
      approvedAt: row.approvedAt,
      completedAt: row.completedAt,
      fanoutAttempts: row.fanoutAttempts,
      fanoutFailureCode: row.fanoutFailureCode,
    }
  }
  async list(q: PushPagingDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 20
    const [rows, total] = await this.db.client.$transaction([
      this.db.client.pushCampaign.findMany({
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.pushCampaign.count(),
    ])
    return {
      items: rows.map((r) => this.present(r)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }
  async get(id: string) {
    const row = await this.db.client.pushCampaign.findUnique({
      where: { id },
      include,
    })
    if (!row) throw new NotFoundException('Push campaign not found')
    return this.present(row)
  }
  async save(id: string | null, input: SavePushCampaignDto, actorId: string) {
    if (
      (!id && input.expectedRevision !== 0) ||
      (id && input.expectedRevision === 0)
    )
      throw new ConflictException('Invalid campaign revision')
    const title = emailText(input.title, 160),
      body = emailText(input.body, 500)
    if (/[{}]/.test(title + body))
      throw new ConflictException('Campaign copy is literal plain text')
    const selected = input.selectedUserIds ?? []
    if (
      (input.audience === 'SELECTED_CUSTOMERS' && !selected.length) ||
      (input.audience === 'ALL_OPTED_IN_CUSTOMERS' && selected.length)
    )
      throw new ConflictException('Explicit selected audience mismatch')
    try {
      return await this.db.client.$transaction(async (tx) => {
        await publicPushTarget(tx, input.targetType, input.targetId ?? null)
        if (input.imageMediaId)
          await lockPushImage(
            tx,
            input.imageMediaId,
            this.config.get('MEDIA_NAMESPACE', { infer: true }),
          )
        if (
          selected.length &&
          (await tx.user.count({
            where: { id: { in: selected }, role: 'CUSTOMER', status: 'ACTIVE' },
          })) !== selected.length
        )
          throw new ConflictException('Select active canonical customers')
        const values = {
          title,
          body,
          audience: input.audience,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          imageMediaId: input.imageMediaId ?? null,
        }
        let campaignId: string
        if (id) {
          const updated = await tx.pushCampaign.updateMany({
            where: { id, status: 'DRAFT', revision: input.expectedRevision },
            data: { ...values, revision: { increment: 1 } },
          })
          if (!updated.count)
            throw new ConflictException(
              'Only current DRAFT campaigns can be edited',
            )
          campaignId = id
          await tx.pushCampaignAudience.deleteMany({ where: { campaignId } })
        } else campaignId = (await tx.pushCampaign.create({ data: values })).id
        if (selected.length)
          await tx.pushCampaignAudience.createMany({
            data: selected.map((userId) => ({ campaignId, userId })),
          })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'push.campaign.saved',
            targetType: 'push_campaign',
            targetId: campaignId,
          },
        })
        return this.present(
          await tx.pushCampaign.findUniqueOrThrow({
            where: { id: campaignId },
            include,
          }),
        )
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2034'].includes(error.code)
      )
        throw new ConflictException('Campaign/reference changed')
      throw error
    }
  }
  async approve(id: string, input: ApprovePushCampaignDto, actorId: string) {
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.pushCampaign.findUnique({ where: { id }, include })
      if (!row) throw new NotFoundException('Push campaign not found')
      await publicPushTarget(tx, row.targetType, row.targetId)
      if (row.imageMediaId)
        await lockPushImage(
          tx,
          row.imageMediaId,
          this.config.get('MEDIA_NAMESPACE', { infer: true }),
        )
      const clock = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
      const event = await tx.outboxEvent.create({
        data: {
          eventType: 'push.campaign.approved',
          payload: { campaignId: id, revision: input.expectedRevision },
        },
      })
      const changed = await tx.pushCampaign.updateMany({
        where: { id, status: 'DRAFT', revision: input.expectedRevision },
        data: {
          status: 'SCHEDULED',
          scheduledAt: input.scheduledAt
            ? new Date(input.scheduledAt)
            : clock[0]!.now,
          approvedAt: clock[0]!.now,
          approvedById: actorId,
          eventId: event.id,
          revision: { increment: 1 },
        },
      })
      if (!changed.count)
        throw new ConflictException('Only current draft can be approved')
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'push.campaign.approved',
          targetType: 'push_campaign',
          targetId: id,
        },
      })
      return this.present(
        await tx.pushCampaign.findUniqueOrThrow({ where: { id }, include }),
      )
    })
  }
  async cancel(id: string, revision: number, actorId: string) {
    return this.db.client.$transaction(async (tx) => {
      const result = await tx.pushCampaign.updateMany({
        where: { id, revision, status: { not: 'CANCELLED' } },
        data: {
          status: 'CANCELLED',
          imageMediaId: null,
          revision: { increment: 1 },
        },
      })
      if (!result.count)
        throw new ConflictException('Campaign changed or already cancelled')
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'push.campaign.cancelled',
          targetType: 'push_campaign',
          targetId: id,
        },
      })
      return this.present(
        await tx.pushCampaign.findUniqueOrThrow({ where: { id }, include }),
      )
    })
  }
  private audience(row: {
    id: string
    audience: string
  }): Prisma.UserWhereInput {
    return {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      notificationPreference: {
        is: {
          marketingConsentAt: { not: null },
          OR: [{ marketingInApp: true }, { marketingPush: true }],
        },
      },
      ...(row.audience === 'SELECTED_CUSTOMERS'
        ? { pushCampaignAudience: { some: { campaignId: row.id } } }
        : {}),
    }
  }
  async preview(id: string) {
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.pushCampaign.findUnique({ where: { id }, include })
      if (!row) throw new NotFoundException('Push campaign not found')
      const targetPath = await publicPushTarget(
          tx,
          row.targetType,
          row.targetId,
        ),
        where = this.audience(row)
      const eligibleCustomers = await tx.user.count({ where })
      const deviceCount = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM push_devices d JOIN users u ON u.id=d.user_id JOIN notification_preferences p ON p.user_id=u.id WHERE u.role='CUSTOMER' AND u.status='ACTIVE' AND p.marketing_push=true AND p.marketing_consent_at IS NOT NULL AND d.status='ACTIVE' AND d.surface='STOREFRONT' AND d.project_id=${this.config.get('FCM_PROJECT_ID', { infer: true })} AND d.expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND d.session_version=u.session_version AND d.token_ciphertext IS NOT NULL AND (${row.audience === 'ALL_OPTED_IN_CUSTOMERS'} OR EXISTS(SELECT 1 FROM push_campaign_audiences a WHERE a.campaign_id=${row.id}::uuid AND a.user_id=u.id))`
      const eligibleDevices = Number(deviceCount[0]!.count)
      return {
        eligibleCustomers,
        eligibleDevices,
        targetPath,
        image: pushImage(
          row.imageMedia,
          this.config.get('MEDIA_NAMESPACE', { infer: true }),
          row.title,
        ),
        providerInvoked: false,
      }
    })
  }
  async metrics(id: string) {
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.pushCampaign.findUnique({
        where: { id },
        select: { completedAt: true },
      })
      if (!row) throw new NotFoundException('Push campaign not found')
      const recipients = await tx.pushCampaignRecipient.count({
          where: { campaignId: id },
        }),
        inApp = await tx.pushCampaignRecipient.count({
          where: { campaignId: id, inAppCreated: true },
        }),
        queued = await tx.pushDelivery.count({ where: { campaignId: id } })
      const states = await tx.$queryRaw<
        { status: string; count: bigint }[]
      >`SELECT status,count(*) AS count FROM push_deliveries WHERE campaign_id=${id}::uuid GROUP BY status`
      const count = (names: string[]) =>
        states
          .filter((r) => names.includes(r.status))
          .reduce((n, r) => n + Number(r.count), 0)
      return {
        fanoutComplete: !!row.completedAt,
        recipientsProcessed: recipients,
        inAppCreated: inApp,
        pushQueued: queued,
        accepted: count(['ACCEPTED']),
        failed: count(['FAILED', 'REJECTED', 'REQUIRES_REVIEW']),
        skipped: count(['SKIPPED']),
        pending: count(['PENDING', 'PROCESSING']),
        deviceDeliveryVerified: false,
      }
    })
  }
  async fanout(limit = 50, apply = false) {
    const clock = await this.db.client.$queryRaw<
      { now: Date }[]
    >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
    const rows = await this.db.client.pushCampaign.findMany({
      where: {
        status: { in: ['SCHEDULED', 'FANOUT'] },
        scheduledAt: { lte: clock[0]!.now },
        retryAt: { lte: clock[0]!.now },
        fanoutAttempts: { lt: 5 },
      },
      select: { id: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: Math.min(limit, 10),
    })
    const result = { apply, campaigns: rows.length, recipients: 0, failed: 0 }
    if (!apply) return result
    for (const candidate of rows) {
      try {
        result.recipients += await this.db.client.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM push_campaigns WHERE id=${candidate.id}::uuid FOR UPDATE SKIP LOCKED`
            if (!locked.length) return 0
            const row = await tx.pushCampaign.findUniqueOrThrow({
              where: { id: candidate.id },
              include: { imageMedia: true },
            })
            if (!['SCHEDULED', 'FANOUT'].includes(row.status) || !row.eventId)
              return 0
            await publicPushTarget(tx, row.targetType, row.targetId)
            if (
              row.imageMediaId &&
              !pushImage(
                row.imageMedia,
                this.config.get('MEDIA_NAMESPACE', { infer: true }),
                row.title,
              )
            )
              throw new Error('CAMPAIGN_IMAGE_UNAVAILABLE')
            const users = await tx.user.findMany({
              where: {
                ...this.audience(row),
                ...(row.fanoutCursor ? { id: { gt: row.fanoutCursor } } : {}),
              },
              include: {
                notificationPreference: true,
                pushDevices: {
                  where: {
                    projectId: this.config.get('FCM_PROJECT_ID', {
                      infer: true,
                    }),
                    status: 'ACTIVE',
                    surface: 'STOREFRONT',
                    expiresAt: { gt: clock[0]!.now },
                  },
                  take: 10,
                },
              },
              orderBy: { id: 'asc' },
              take: limit,
            })
            if (users.length) {
              const notification = await tx.notification.upsert({
                where: {
                  eventId_audience: {
                    eventId: row.eventId,
                    audience: 'MARKETING',
                  },
                },
                create: {
                  eventId: row.eventId,
                  campaignId: row.id,
                  imageMediaId: row.imageMediaId,
                  kind: 'PUSH_CAMPAIGN',
                  audience: 'MARKETING',
                  title: row.title,
                  body: row.body,
                  targetType: row.targetType,
                  targetId: row.targetId,
                  templateRevision: row.revision,
                },
                update: {},
              })
              for (const user of users) {
                const inAppCreated =
                  user.notificationPreference?.marketingInApp === true
                const devices = user.notificationPreference?.marketingPush
                  ? user.pushDevices.filter(
                      (device) => device.sessionVersion === user.sessionVersion,
                    )
                  : []
                if (inAppCreated)
                  await tx.notificationRecipient.createMany({
                    data: [
                      { userId: user.id, notificationId: notification.id },
                    ],
                    skipDuplicates: true,
                  })
                for (const device of devices)
                  await tx.pushDelivery.createMany({
                    data: [
                      {
                        eventId: row.eventId,
                        deviceId: device.id,
                        deviceRevision: device.revision,
                        campaignId: row.id,
                        imageMediaId: row.imageMediaId,
                        kind: 'PUSH_CAMPAIGN',
                        audience: 'MARKETING',
                        title: row.title,
                        body: row.body,
                        targetType: row.targetType,
                        targetId: row.targetId,
                      },
                    ],
                    skipDuplicates: true,
                  })
                await tx.pushCampaignRecipient.createMany({
                  data: [
                    {
                      campaignId: row.id,
                      userId: user.id,
                      inAppCreated,
                      pushCount: devices.length,
                    },
                  ],
                  skipDuplicates: true,
                })
              }
            }
            await tx.pushCampaign.update({
              where: { id: row.id },
              data: {
                status: users.length < limit ? 'FANOUT_COMPLETE' : 'FANOUT',
                startedAt: row.startedAt ?? clock[0]!.now,
                completedAt: users.length < limit ? clock[0]!.now : null,
                fanoutCursor: users.at(-1)?.id ?? row.fanoutCursor,
                fanoutAttempts: 0,
                fanoutFailureCode: null,
              },
            })
            return users.length
          },
          { timeout: 20000 },
        )
      } catch {
        result.failed++
        await this.db.client.pushCampaign.updateMany({
          where: { id: candidate.id, status: { in: ['SCHEDULED', 'FANOUT'] } },
          data: {
            fanoutAttempts: { increment: 1 },
            fanoutFailureCode: 'CAMPAIGN_FANOUT_FAILED',
            retryAt: new Date(Date.now() + 60000),
          },
        })
        await this.db.client.pushCampaign.updateMany({
          where: {
            id: candidate.id,
            fanoutAttempts: { gte: 5 },
            status: { in: ['SCHEDULED', 'FANOUT'] },
          },
          data: { status: 'REQUIRES_REVIEW' },
        })
      }
    }
    return result
  }
}
