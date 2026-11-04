import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { PushProvider, PushSubmissionError } from './push.provider'
import { PushContent } from './push-content'
import { PushPolicySkip } from './push-content'
@Injectable()
export class PushDispatcher {
  private readonly content: PushContent
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly provider: PushProvider,
  ) {
    this.content = new PushContent(config)
  }
  private async finish(
    id: string,
    leaseToken: string,
    number: number,
    status: string,
    failureCode: string | null,
    providerMessageId: string | null = null,
    retryAfterSeconds = 0,
  ) {
    return this.db.client.$transaction(async (tx) => {
      const result = await tx.pushDelivery.updateMany({
        where: { id, status: 'PROCESSING', leaseToken },
        data: {
          status,
          failureCode,
          providerMessageId,
          leaseToken: null,
          leaseExpiresAt: null,
          acceptedAt: status === 'ACCEPTED' ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() +
              Math.max(
                Math.min(3600000, 60000 * 2 ** (number - 1)),
                retryAfterSeconds * 1000,
              ),
          ),
        },
      })
      if (!result.count) return false
      await tx.pushDeliveryAttempt.update({
        where: { deliveryId_number: { deliveryId: id, number } },
        data: { status, failureCode, finishedAt: new Date() },
      })
      await tx.auditEvent.create({
        data: {
          action: 'push.submission.' + status.toLowerCase(),
          targetType: 'push_delivery',
          targetId: id,
        },
      })
      return true
    })
  }
  async dispatch(since: Date, limit = 50, apply = false) {
    const enabled =
      this.config.get('PUSH_DELIVERY_MODE', { infer: true }) !== 'disabled'
    if (apply && !enabled)
      throw new ServiceUnavailableException('Push delivery is disabled')
    const expired = await this.db.client.pushDelivery.findMany({
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
            'FCM_WORKER_INTERRUPTED',
          )
    const jobs = await this.db.client.pushDelivery.findMany({
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
        >`SELECT id FROM push_deliveries WHERE id=${candidate.id}::uuid FOR UPDATE SKIP LOCKED`
        if (!locked.length) return null
        const job = await tx.pushDelivery.findUniqueOrThrow({
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
        await tx.pushDelivery.update({
          where: { id: job.id },
          data: {
            status: 'PROCESSING',
            attempts: number,
            leaseToken,
            leaseExpiresAt: new Date(Date.now() + 300000),
            failureCode: null,
          },
        })
        await tx.pushDeliveryAttempt.create({
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
            const job = await tx.pushDelivery.findUniqueOrThrow({
              where: { id: claimed.id },
              include: {
                event: true,
                campaign: true,
                device: {
                  include: {
                    user: { include: { notificationPreference: true } },
                  },
                },
                imageMedia: true,
              },
            })
            return this.content.message(tx, job)
          },
          { timeout: 20000 },
        )
        submitting = true
        const accepted = await this.provider.submit(message)
        if (
          await this.finish(
            claimed.id,
            claimed.leaseToken,
            claimed.number,
            'ACCEPTED',
            null,
            accepted.messageId,
          )
        )
          result.accepted++
        else result.review++
      } catch (error) {
        if (error instanceof PushPolicySkip) {
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
          error instanceof PushSubmissionError
            ? error
            : new PushSubmissionError(
                submitting ? 'UNCERTAIN' : 'RETRYABLE',
                submitting
                  ? 'FCM_SUBMISSION_UNCERTAIN'
                  : 'PUSH_PREPARATION_FAILED',
              )
        if (failure.disposition === 'INVALID_TOKEN') {
          const job = await this.db.client.pushDelivery.findUnique({
            where: { id: claimed.id },
            select: { deviceId: true, deviceRevision: true },
          })
          if (job)
            await this.db.client.pushDevice.updateMany({
              where: { id: job.deviceId, revision: job.deviceRevision },
              data: {
                status: 'INVALID',
                tokenCiphertext: Prisma.DbNull,
                revision: { increment: 1 },
              },
            })
        }
        const status =
          failure.disposition === 'UNCERTAIN'
            ? 'REQUIRES_REVIEW'
            : ['PERMANENT', 'INVALID_TOKEN'].includes(failure.disposition) ||
                claimed.number >= 5
              ? 'REJECTED'
              : 'FAILED'
        await this.finish(
          claimed.id,
          claimed.leaseToken,
          claimed.number,
          status,
          failure.safeCode,
          null,
          failure.retryAfterSeconds,
        )
        if (status === 'REQUIRES_REVIEW') result.review++
        else result.failed++
      }
    }
    return result
  }
}
