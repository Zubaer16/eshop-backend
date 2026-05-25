import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from '../../config';
import logger from '../../config/logger';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg(
  new pg.Pool({
    connectionString: config.env.DATABASE_URL,
  }),
);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error'],
  });

globalForPrisma.prisma = prisma;

function getDatabaseHost() {
  try {
    return new URL(config.env.DATABASE_URL).host;
  } catch {
    return 'unknown';
  }
}

export async function connectPrisma() {
  await prisma.$connect();

  logger.info(
    {
      databaseHost: getDatabaseHost(),
      databaseSource: 'DATABASE_URL',
    },
    'Database connection established',
  );
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
