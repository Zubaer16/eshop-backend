import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import {
  AdminStoreOperationsDto,
  PublicStoreOperationsDto,
  PutStoreOperationsDto,
} from './store-operations.dto'

const KEY = 'primary'
type Row = {
  revision: number
  locale: string
  displayCurrency: string
  orderPrefix: string
  themeMode: string
  accentColor: string
  storefrontOrigin: string
  adminOrigin: string
  showWishlist: boolean
  showPolicies: boolean
  updatedAt: Date
}

function publicProjection(row: Row | null): PublicStoreOperationsDto {
  return {
    configured: !!row,
    locale: row?.locale ?? 'en-US',
    displayCurrency: row?.displayCurrency ?? 'USD',
    themeMode: (row?.themeMode ?? 'system') as 'light' | 'dark' | 'system',
    accentColor: row?.accentColor ?? '#1F2937',
    showWishlist: row?.showWishlist ?? true,
    showPolicies: row?.showPolicies ?? true,
    guestCheckoutEnabled: false,
    guestCartEnabled: true,
  }
}

// Metadata never drives CORS. Deployment owner must explicitly edit CORS_ORIGINS.
function cleanOrigin(value: string): string {
  if (value === '') return ''
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new BadRequestException('Expected bare HTTPS origin')
  }
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.port ||
    url.hostname === 'localhost' ||
    /^(?:127|10|192\.168)\./.test(url.hostname)
  )
    throw new BadRequestException('Expected bare public HTTPS origin')
  return value
}

@Injectable()
export class StoreOperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async publicOperations(): Promise<PublicStoreOperationsDto> {
    return publicProjection(
      await this.db.client.storeOperations.findUnique({ where: { key: KEY } }),
    )
  }

  private asAdmin(row: Row | null): AdminStoreOperationsDto {
    return {
      ...publicProjection(row),
      orderPrefix: row?.orderPrefix ?? 'KB',
      storefrontOrigin: row?.storefrontOrigin ?? '',
      adminOrigin: row?.adminOrigin ?? '',
      revision: row?.revision ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      deploymentCorsOrigins: this.config
        .get('CORS_ORIGINS', { infer: true })
        .split(',')
        .filter(Boolean),
    }
  }

  async adminOperations(): Promise<AdminStoreOperationsDto> {
    return this.asAdmin(
      await this.db.client.storeOperations.findUnique({ where: { key: KEY } }),
    )
  }

  async put(
    input: PutStoreOperationsDto,
    actorId: string,
  ): Promise<AdminStoreOperationsDto> {
    const values = {
      locale: input.locale,
      displayCurrency: input.displayCurrency,
      orderPrefix: input.orderPrefix,
      themeMode: input.themeMode,
      accentColor: input.accentColor.toUpperCase(),
      storefrontOrigin: cleanOrigin(input.storefrontOrigin),
      adminOrigin: cleanOrigin(input.adminOrigin),
      showWishlist: input.showWishlist,
      showPolicies: input.showPolicies,
    }
    if (
      values.storefrontOrigin &&
      values.storefrontOrigin === values.adminOrigin
    )
      throw new BadRequestException(
        'Storefront and Admin origins must be distinct',
      )
    try {
      return await this.db.client.$transaction(async (tx) => {
        let row: Row
        if (input.expectedRevision === 0) {
          row = await tx.storeOperations.create({
            data: { key: KEY, ...values },
          })
        } else {
          const changed = await tx.storeOperations.updateMany({
            where: { key: KEY, revision: input.expectedRevision },
            data: { ...values, revision: { increment: 1 } },
          })
          if (changed.count !== 1)
            throw new ConflictException(
              'Store operations changed. Reload and retry.',
            )
          row = await tx.storeOperations.findUniqueOrThrow({
            where: { key: KEY },
          })
        }
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'store.operations.updated',
            targetType: 'store_operations',
            targetId: KEY,
          },
        })
        return this.asAdmin(row)
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Store operations changed. Reload and retry.',
        )
      throw error
    }
  }
}
