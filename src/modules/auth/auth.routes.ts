import { Router } from 'express';
import passport from 'passport';
import { AuthController } from './auth.controller';
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: 'Too many requests, please try again later' },
});

export const createAuthRouter = (authController: AuthController) => {
  const router = Router();

  router.post('/register', authLimiter, (req, res, next) => authController.register(req, res, next));
  router.post('/login', authLimiter, (req, res, next) => authController.login(req, res, next));
  router.post('/refresh', authLimiter, (req, res, next) => authController.refresh(req, res, next));

  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get(
    '/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/login' }),
    (req, res) => authController.oauthSuccess(req, res)
  );

  return router;
};
