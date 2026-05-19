import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  phone: z.string().optional(),
  profileImage: z.string().url('Invalid image URL').optional().or(z.literal('')),
}).openapi('RegisterRequest');

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
}).openapi('LoginRequest');

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).openapi('RefreshRequest');

export const oauthSchema = {
  body: z.object({
    code: z.string().min(1).optional(),
    codeVerifier: z.string().min(1).optional(),
    redirectUri: z.string().url().optional(),
    idToken: z.string().min(1).optional(),
  }).refine((data) => data.code || data.idToken, {
    message: 'code or idToken is required',
  }),
};

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
