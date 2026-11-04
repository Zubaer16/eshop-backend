import { ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { emailDefaults, validatedEmailTemplate } from './email.policy'
import {
  EmailPageQueryDto,
  EmailPagingDto,
  SaveEmailTemplateDto,
} from './email.dto'
@Injectable()
export class EmailAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  status() {
    return {
      mode: this.config.get('EMAIL_DELIVERY_MODE', { infer: true }),
      provider: 'smtp',
      configured:
        !!this.config.get('EMAIL_SMTP_HOST', { infer: true }) &&
        !!this.config.get('EMAIL_SMTP_PASSWORD', { infer: true }),
      senderConfigured: !!this.config.get('EMAIL_FROM_ADDRESS', {
        infer: true,
      }),
      controlledRecipientCount: this.config
        .get('EMAIL_RECIPIENT_ALLOWLIST', { infer: true })
        .split(',')
        .filter(Boolean).length,
      tlsMode:
        this.config.get('EMAIL_SMTP_PORT', { infer: true }) === 465
          ? 'TLS'
          : 'STARTTLS_REQUIRED',
      providerVerified: false,
    }
  }
  async templates() {
    const rows = await this.db.client.emailTemplate.findMany()
    return emailDefaults.map((d) => {
      const row = rows.find((r) => r.key === d.key)
      return {
        key: d.key,
        subject: row?.subject ?? d.subject,
        text: row?.text ?? d.text,
        revision: row?.revision ?? 0,
      }
    })
  }
  async saveTemplate(key: string, dto: SaveEmailTemplateDto, actorId: string) {
    const values = validatedEmailTemplate(key, dto.subject, dto.text)
    try {
      return await this.db.client.$transaction(async (tx) => {
        if (dto.expectedRevision === 0)
          await tx.emailTemplate.create({ data: { key, ...values } })
        else if (
          !(
            await tx.emailTemplate.updateMany({
              where: { key, revision: dto.expectedRevision },
              data: { ...values, revision: { increment: 1 } },
            })
          ).count
        )
          throw new ConflictException('Email template changed')
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'email.template.saved',
            targetType: 'email_template',
            targetId: key,
          },
        })
        const row = await tx.emailTemplate.findUniqueOrThrow({ where: { key } })
        return {
          key: row.key,
          subject: row.subject,
          text: row.text,
          revision: row.revision,
        }
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Email template already overridden')
      throw error
    }
  }
  async deliveries(q: EmailPageQueryDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 20,
      where = q.status ? { status: q.status } : {}
    const [items, total] = await this.db.client.$transaction([
      this.db.client.emailDelivery.findMany({
        where,
        select: {
          id: true,
          kind: true,
          audience: true,
          status: true,
          attempts: true,
          failureCode: true,
          createdAt: true,
          nextAttemptAt: true,
          acceptedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.emailDelivery.count({ where }),
    ])
    return { items, total, page, limit, pages: Math.ceil(total / limit) }
  }
  async planningFailures(q: EmailPagingDto) {
    const rows = await this.db.client.emailEventReceipt.findMany({
      where: { failureCode: { not: null } },
      include: { event: { select: { eventType: true } } },
      orderBy: [{ updatedAt: 'desc' }, { eventId: 'asc' }],
      skip: ((q.page ?? 1) - 1) * (q.limit ?? 20),
      take: q.limit ?? 20,
    })
    return rows.map((row) => ({
      eventId: row.eventId,
      eventType: row.event.eventType,
      status: row.status,
      attempts: row.attempts,
      failureCode: row.failureCode,
      nextAttemptAt: row.nextAttemptAt,
    }))
  }
}
