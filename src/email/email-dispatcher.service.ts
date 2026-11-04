import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { EmailProvider, EmailSubmissionError } from './email.provider'
import { EmailContent } from './email-content'
import { EmailPolicySkip } from './email.policy'
@Injectable()
export class EmailDispatcher {
  private readonly content: EmailContent
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly provider: EmailProvider,
  ) {
    this.content = new EmailContent(config)
  }
  private async finish(
    id: string,
    leaseToken: string,
    number: number,
    status: string,
    failureCode: string | null,
  ) {
    return this.db.client.$transaction(async (tx) => {
      const result = await tx.emailDelivery.updateMany({
        where: { id, status: 'PROCESSING', leaseToken },
        data: {
          status,
          failureCode,
          leaseToken: null,
          leaseExpiresAt: null,
          acceptedAt: status === 'ACCEPTED' ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** (number - 1)),
          ),
        },
      })
      if (!result.count) return false
      await tx.emailDeliveryAttempt.update({
        where: { deliveryId_number: { deliveryId: id, number } },
        data: { status, failureCode, finishedAt: new Date() },
      })
      await tx.auditEvent.create({
        data: {
          action: 'email.submission.' + status.toLowerCase(),
          targetType: 'email_delivery',
          targetId: id,
        },
      })
      return true
    })
  }
  async dispatch(since: Date, limit = 50, apply = false) {
    const enabled =
      this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) !== 'disabled'
    if (apply && !enabled)
      throw new ServiceUnavailableException('Email delivery is disabled')
    const expired = await this.db.client.emailDelivery.findMany({
      where: {
        status: 'PROCESSING',
        leaseExpiresAt: { lte: new Date() },
        event: { createdAt: { gte: since } },
      },
      select: { id: true, leaseToken: true, attempts: true },
      take: limit,
    })
    const result = {
      apply,
      enabled,
      candidates: 0,
      accepted: 0,
      failed: 0,
      skipped: 0,
      review: expired.length,
    }
    if (apply)
      for (const job of expired)
        if (job.leaseToken)
          await this.finish(
            job.id,
            job.leaseToken,
            job.attempts,
            'REQUIRES_REVIEW',
            'SMTP_WORKER_INTERRUPTED',
          )
    const jobs = await this.db.client.emailDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: 5 },
        nextAttemptAt: { lte: new Date() },
        event: { createdAt: { gte: since } },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
    result.candidates = jobs.length
    if (!apply) return result
    for (const candidate of jobs) {
      const claimed = await this.db.client.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM email_deliveries WHERE id=${candidate.id}::uuid FOR UPDATE SKIP LOCKED`
        if (!locked.length) return null
        const job = await tx.emailDelivery.findUniqueOrThrow({
          where: { id: candidate.id },
        })
        if (
          !['PENDING', 'FAILED'].includes(job.status) ||
          job.attempts >= 5 ||
          job.nextAttemptAt > new Date()
        )
          return null
        const leaseToken = randomUUID(),
          number = job.attempts + 1
        await tx.emailDelivery.update({
          where: { id: job.id },
          data: {
            status: 'PROCESSING',
            attempts: number,
            leaseToken,
            leaseExpiresAt: new Date(Date.now() + 300000),
            failureCode: null,
          },
        })
        await tx.emailDeliveryAttempt.create({
          data: { deliveryId: job.id, number, status: 'STARTED' },
        })
        return { id: job.id, leaseToken, number }
      })
      if (!claimed) {
        result.skipped++
        continue
      }
      let submitting = false
      try {
        const message = await this.db.client.$transaction(
          async (tx) => {
            const job = await tx.emailDelivery.findUniqueOrThrow({
              where: { id: claimed.id },
              include: { event: true },
            })
            return this.content.message(tx, job)
          },
          { timeout: 20000 },
        )
        submitting = true
        await this.provider.submit(message)
        if (
          await this.finish(
            claimed.id,
            claimed.leaseToken,
            claimed.number,
            'ACCEPTED',
            null,
          )
        )
          result.accepted++
        else result.review++
      } catch (error) {
        if (error instanceof EmailPolicySkip) {
          await this.finish(
            claimed.id,
            claimed.leaseToken,
            claimed.number,
            'SKIPPED',
            error.message,
          )
          result.skipped++
          continue
        }
        const failure =
          error instanceof EmailSubmissionError
            ? error
            : new EmailSubmissionError(
                submitting ? 'UNCERTAIN' : 'RETRYABLE',
                submitting
                  ? 'SMTP_SUBMISSION_UNCERTAIN'
                  : 'EMAIL_PREPARATION_FAILED',
              )
        const status =
          failure.disposition === 'UNCERTAIN'
            ? 'REQUIRES_REVIEW'
            : failure.disposition === 'PERMANENT' || claimed.number >= 5
              ? 'REJECTED'
              : 'FAILED'
        await this.finish(
          claimed.id,
          claimed.leaseToken,
          claimed.number,
          status,
          failure.safeCode,
        )
        if (status === 'REQUIRES_REVIEW') result.review++
        else result.failed++
      }
    }
    return result
  }
}
