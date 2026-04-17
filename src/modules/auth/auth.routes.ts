import { Router } from 'express';
import passport from 'passport';
import { AuthController } from './auth.controller';

export const createAuthRouter = (authController: AuthController) => {
  const router = Router();

  router.post('/register', (req, res, next) => authController.register(req, res, next));
  router.post('/login', (req, res, next) => authController.login(req, res, next));
  router.post('/refresh', (req, res, next) => authController.refresh(req, res, next));

  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get(
    '/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/login' }),
    (req, res) => authController.oauthSuccess(req, res)
  );

  router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
  router.get(
    '/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: '/api/v1/auth/login' }),
    (req, res) => authController.oauthSuccess(req, res)
  );

  return router;
};
