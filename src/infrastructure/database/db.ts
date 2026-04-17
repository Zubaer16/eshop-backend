import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from '@/config';

const adapter = new PrismaPg(new pg.Pool({
  connectionString: config.env.DATABASE_URL,
}));

export const prisma = new PrismaClient({ adapter });







