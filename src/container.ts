import { configurePassport } from './infrastructure/auth/passport.config';
import { prisma } from './infrastructure/database/db';
import { AuthController } from './modules/auth/auth.controller';
import { AuthRepository } from './modules/auth/auth.repository';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { OAuthService } from './modules/auth/oauth.service';

const authRepository = new AuthRepository(prisma);
const authService = new AuthService(authRepository);
const authController = new AuthController(authService);
const oauthService = new OAuthService(authRepository);

configurePassport(oauthService);

export const container = {
  authRepository,
  authService,
  authController,
  oauthService,
  authRouter: createAuthRouter(authController),
};
