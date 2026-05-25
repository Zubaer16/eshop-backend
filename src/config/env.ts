import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRATION: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().min(1).default('7d'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/v1/auth/google/callback'),
});

export const envConfig = envSchema.parse(process.env);

if (envConfig.NODE_ENV === 'production') {
  const oauthMissing = !envConfig.GOOGLE_CLIENT_ID || !envConfig.GOOGLE_CLIENT_SECRET;
  if (oauthMissing) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production for Google OAuth. ' +
      'Set them in .env or disable Google OAuth routes.'
    );
  }
}
