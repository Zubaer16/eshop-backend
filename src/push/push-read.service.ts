import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import type { SafeUser } from '../auth/auth.types'
import { publicPushTarget } from './push-targets'
import { PushDeliveryQueryDto, PushPagingDto } from './push.dto'
@Injectable()
export class PushReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  status() {
    return {
      mode: this.config.get('PUSH_DELIVERY_MODE', { infer: true }),
      registrationConfigured:
        !!this.config.get('FCM_PROJECT_ID', { infer: true }) &&
        !!this.config.get('PUSH_TOKEN_ENCRYPTION_KEY', { infer: true }),
      providerConfigured:
        !!this.config.get('FCM_CLIENT_EMAIL', { infer: true }) &&
        !!this.config.get('FCM_PRIVATE_KEY', { infer: true }),
      providerVerified: false,
      platform: 'WEB',
    }
  }
  async deliveries(q: PushDeliveryQueryDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 20,
      where = q.status ? { status: q.status } : {}
    const [items, total] = await this.db.client.$transaction([
      this.db.client.pushDelivery.findMany({
        where,
        select: {
          id: true,
          kind: true,
          audience: true,
          status: true,
          attempts: true,
          failureCode: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.pushDelivery.count({ where }),
    ])
    return { items, total, page, limit, pages: Math.ceil(total / limit) }
  }
  async failures(q: PushPagingDto) {
    return this.db.client.pushEventReceipt.findMany({
      where: { failureCode: { not: null } },
      select: {
        eventId: true,
        status: true,
        attempts: true,
        failureCode: true,
        nextAttemptAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { eventId: 'asc' }],
      skip: ((q.page ?? 1) - 1) * (q.limit ?? 20),
      take: q.limit ?? 20,
    })
  }
  async target(actor: SafeUser, id: string) {
    const row = await this.db.client.pushDelivery.findFirst({
      where: { id, device: { userId: actor.id } },
      include: { device: { select: { surface: true } } },
    })
    if (
      !row ||
      (row.audience === 'ADMIN' &&
        (actor.role === 'CUSTOMER' ||
          (actor.role !== 'OWNER' &&
            !actor.permissions?.some((p) => p === row.permissionKey))))
    )
      throw new NotFoundException('Owned push target not found')
    if (row.targetType === 'ORDER' || row.targetType === 'TRACKING') {
      const order = await this.db.client.order.findUnique({
        where: { id: row.targetId! },
        select: { customerId: true },
      })
      if (!order || (row.audience !== 'ADMIN' && order.customerId !== actor.id))
        throw new NotFoundException('Owned order target not found')
    } else await publicPushTarget(this.db.client, row.targetType, row.targetId)
    return {
      targetType: row.targetType,
      targetId: row.targetId,
      surface: row.device.surface,
    }
  }
}
