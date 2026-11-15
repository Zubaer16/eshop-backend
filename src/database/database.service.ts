import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { Environment } from '../config/environment'
import { collectRequestWork } from '../jobs/request-work.context'

function databaseClient(url: string): PrismaClient {
  // This query observer preserves model arguments/results and the existing
  // transaction-client contract used throughout the domain services.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 5000,
    }),
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          collectRequestWork(model, operation, args, result)
          return result
        },
      },
    },
  }) as unknown as PrismaClient
}

/** Client-owned external PostgreSQL. Does not connect on liveness-only builds. */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly instance: ReturnType<typeof databaseClient> | null
  constructor(config: ConfigService<Environment, true>) {
    const url = config.get('DATABASE_URL', { infer: true })
    this.instance = url ? databaseClient(url) : null
  }

  get client() {
    if (!this.instance) {
      throw new ServiceUnavailableException(
        'Database is not configured; set DATABASE_URL and apply migrations',
      )
    }
    return this.instance
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) await this.instance.$disconnect()
  }
}
