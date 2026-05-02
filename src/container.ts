import { configurePassport } from './infrastructure/auth/passport.config';
import { prisma } from './infrastructure/database/db';
import { AuthController } from './modules/auth/auth.controller';
import { AuthRepository } from './modules/auth/auth.repository';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { OAuthService } from './modules/auth/oauth.service';
import { ProductController } from './modules/products/product.controller';
import { ProductRepository } from './modules/products/product.repository';
import { createProductRouter } from './modules/products/product.routes';
import { ProductService } from './modules/products/product.service';

const authRepository = new AuthRepository(prisma);
const authService = new AuthService(authRepository);
const authController = new AuthController(authService);
const oauthService = new OAuthService(authRepository);

const productRepository = new ProductRepository(prisma);
const productService = new ProductService(productRepository);
const productController = new ProductController(productService);

configurePassport(oauthService);

export const container = {
  authRepository,
  authService,
  authController,
  oauthService,
  authRouter: createAuthRouter(authController),
  productRepository,
  productService,
  productController,
  productRouter: createProductRouter(productController),
};
