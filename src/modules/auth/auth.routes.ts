import { Router, Request, Response } from 'express';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { envConfig } from '@/config/env';
import { validate } from '@/shared/middlewares/validate.middleware';
import { loginSchema, oauthSchema, refreshSchema, registerSchema } from './validators/auth.schema';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later' },
  },
});

const oauthNotConfigured = (_req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: { message: 'Google OAuth is not configured' },
  });
};

export const createAuthRouter = (authController: AuthController) => {
  const router = Router();

  router.post('/register', authLimiter, validate(registerSchema), (req, res, next) => authController.register(req, res, next));
  router.post('/login', authLimiter, validate(loginSchema), (req, res, next) => authController.login(req, res, next));
  router.post('/refresh', authLimiter, validate(refreshSchema), (req, res, next) => authController.refresh(req, res, next));

  // OAuth with id_token/code (YL-style API route)
  router.post('/oauth/:provider', authLimiter, validate(oauthSchema), (req, res, next) => authController.oauthLogin(req, res, next));

  // Legacy passport OAuth (optional, for backward compatibility)
  const googleConfigured = !!(envConfig.GOOGLE_CLIENT_ID && envConfig.GOOGLE_CLIENT_SECRET);

  if (googleConfigured) {
    router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    router.get(
      '/google/callback',
      passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/login' }),
      (req, res) => authController.oauthSuccess(req, res),
    );
  } else {
    router.get('/google', oauthNotConfigured);
    router.get('/google/callback', oauthNotConfigured);
  }

  return router;
};
