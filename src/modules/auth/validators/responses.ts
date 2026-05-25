import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const authUserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN', 'DELIVERY']),
  name: z.string().nullable().optional(),
}).openapi('AuthUserResponse');

export const registerResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string(),
    user: authUserResponseSchema.omit({ name: true }),
  }),
}).openapi('RegisterResponse');

export const tokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: authUserResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
}).openapi('TokenResponse');

export const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
  }),
}).openapi('RefreshResponse');

export const oauthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    message: z.string().optional(),
    user: authUserResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
}).openapi('OAuthResponse');
