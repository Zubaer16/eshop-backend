import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import {
  decryptEmailActionToken,
  encryptEmailActionToken,
  type EncryptedActionToken,
} from '../auth/email-verification.crypto'
import { RegisterPushDeviceDto } from './push.dto'
import type { SafeUser } from '../auth/auth.types'
const projection = {
  id: true,
  installationId: true,
  surface: true,
  status: true,
  revision: true,
  lastSeenAt: true,
  expiresAt: true,
} as const
@Injectable()
export class PushDevicesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  async list(userId: string) {
    return this.db.client.pushDevice.findMany({
      where: { userId },
      select: projection,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: 50,
    })
  }
  async register(actor: SafeUser, input: RegisterPushDeviceDto) {
    if (
      input.identifierKind === 'FID' &&
      !/^[A-Za-z0-9_-]{22}$/.test(input.token)
    )
      throw new ConflictException(
        'FID must be a canonical 22-character Firebase installation identifier',
      )
    if (input.surface === 'ADMIN' && actor.role === 'CUSTOMER')
      throw new ForbiddenException('Staff account required for Admin device')
    const project = this.config.get('FCM_PROJECT_ID', { infer: true }),
      key = this.config.get('PUSH_TOKEN_ENCRYPTION_KEY', { infer: true })
    if (!project || !key)
      throw new ServiceUnavailableException(
        'Push registration is not configured',
      )
    try {
      return await this.db.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.id}::uuid FOR UPDATE`
        const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.id },
        })
        if (
          user.status !== 'ACTIVE' ||
          (input.surface === 'ADMIN' && user.role === 'CUSTOMER')
        )
          throw new ForbiddenException('Device owner unavailable')
        const existing = await tx.pushDevice.findUnique({
          where: {
            userId_installationId_surface: {
              userId: actor.id,
              installationId: input.installationId,
              surface: input.surface,
            },
          },
        })
        if ((existing?.revision ?? 0) !== input.expectedRevision)
          throw new ConflictException(
            'Device changed; reload registration metadata',
          )
        const tokenHash = createHash('sha256').update(input.token).digest('hex')
        const tokenOwner = await tx.pushDevice.findUnique({
          where: { tokenHash },
          select: { id: true },
        })
        if (tokenOwner && tokenOwner.id !== existing?.id)
          throw new ConflictException(
            'Registration token unavailable; rotate the client token',
          )
        if (
          (!existing ||
            existing.status !== 'ACTIVE' ||
            existing.expiresAt <= new Date()) &&
          (await tx.pushDevice.count({
            where: {
              userId: actor.id,
              surface: input.surface,
              status: 'ACTIVE',
              expiresAt: { gt: new Date() },
            },
          })) >= 10
        )
          throw new ConflictException('Active device limit reached')
        let oldKind: string | null = null
        if (existing?.tokenCiphertext) {
          try {
            const plain = decryptEmailActionToken(
              key,
              existing.tokenCiphertext as unknown as EncryptedActionToken,
              actor.id + ':' + existing.id + ':' + existing.projectId,
            )
            oldKind = plain.startsWith('{')
              ? (JSON.parse(plain) as { kind: string }).kind
              : 'REGISTRATION_TOKEN'
          } catch {
            oldKind = null
          }
        }
        const id = existing?.id ?? randomUUID(),
          changed =
            oldKind !== (input.identifierKind ?? 'REGISTRATION_TOKEN') ||
            !existing ||
            existing.tokenHash !== tokenHash ||
            existing.status !== 'ACTIVE' ||
            existing.expiresAt <= new Date() ||
            existing.sessionVersion !== user.sessionVersion ||
            existing.projectId !== project
        const values = {
          tokenHash,
          tokenCiphertext: encryptEmailActionToken(
            key,
            JSON.stringify({
              kind: input.identifierKind ?? 'REGISTRATION_TOKEN',
              value: input.token,
            }),
            actor.id + ':' + id + ':' + project,
          ),
          status: 'ACTIVE',
          sessionVersion: user.sessionVersion,
          projectId: project,
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 86400000),
        }
        const row = existing
          ? await tx.pushDevice.update({
              where: { id },
              data: {
                ...values,
                ...(changed ? { revision: { increment: 1 } } : {}),
              },
              select: projection,
            })
          : await tx.pushDevice.create({
              data: {
                id,
                userId: actor.id,
                installationId: input.installationId,
                surface: input.surface,
                ...values,
              },
              select: projection,
            })
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            action: 'push.device.registered',
            targetType: 'push_device',
            targetId: id,
          },
        })
        return row
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Device registration changed or token unavailable',
        )
      throw error
    }
  }
  async revoke(userId: string, id: string, revision: number) {
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.pushDevice.findFirst({
        where: { id, userId },
        select: { id: true },
      })
      if (!row) throw new NotFoundException('Owned device not found')
      const result = await tx.pushDevice.updateMany({
        where: { id, userId, revision },
        data: {
          status: 'REVOKED',
          tokenCiphertext: Prisma.DbNull,
          revision: { increment: 1 },
        },
      })
      if (!result.count) throw new ConflictException('Device revision changed')
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'push.device.revoked',
          targetType: 'push_device',
          targetId: id,
        },
      })
      return tx.pushDevice.findUniqueOrThrow({
        where: { id },
        select: projection,
      })
    })
  }
}
