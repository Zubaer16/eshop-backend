import { prisma } from './infrastructure/database/db';
import { AuthController } from './modules/auth/auth.controller';
import { AuthRepository } from './infrastructure/database/repositories/auth.repository';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { OAuthService } from './modules/auth/oauth.service';
import { ProductController } from './modules/products/product.controller';
import { ProductRepository } from './infrastructure/database/repositories/product.repository';
import { createProductRouter } from './modules/products/product.routes';
import { ProductService } from './modules/products/product.service';
import { notFoundHandler } from './shared/errors/global-handler';

// Infrastructure adapters
const authRepository = new AuthRepository(prisma);
const productRepository = new ProductRepository(prisma);

// Domain services
const authService = new AuthService(authRepository);
const oauthService = new OAuthService(authRepository);
const productService = new ProductService(productRepository);

// HTTP controllers
const authController = new AuthController(authService);
const productController = new ProductController(productService);

// HTTP routers
const authRouter = createAuthRouter(authController);
const productRouter = createProductRouter(productController);

// Manual composition root:
// infrastructure -> services -> controllers -> routers.
export const container = {
  prisma,

  authRepository,
  productRepository,

  authService,
  oauthService,
  productService,

  authController,
  productController,

  authRouter,
  productRouter,

  notFoundHandler,
};
