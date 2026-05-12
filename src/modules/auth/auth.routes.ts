import { Router, Request, Response } from 'express';
import passport from 'passport';
import { AuthController } from './auth.controller';
import { envConfig } from '@/config/env';
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: 'Too many requests, please try again later' },
});

const oauthNotConfigured = (req: Request, res: Response) => {
  res.status(503).json({ message: 'Google OAuth is not configured' });
};

export const createAuthRouter = (authController: AuthController) => {
  const router = Router();

  router.post('/register', authLimiter, (req, res, next) => authController.register(req, res, next));
  router.post('/login', authLimiter, (req, res, next) => authController.login(req, res, next));
  router.post('/refresh', authLimiter, (req, res, next) => authController.refresh(req, res, next));

  const googleConfigured = !!(envConfig.GOOGLE_CLIENT_ID && envConfig.GOOGLE_CLIENT_SECRET);

  if (googleConfigured) {
    router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    router.get(
      '/google/callback',
      passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/login' }),
      (req, res) => authController.oauthSuccess(req, res)
    );
  } else {
    router.get('/google', oauthNotConfigured);
    router.get('/google/callback', oauthNotConfigured);
  }

  return router;
};
