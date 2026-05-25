import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { ProductController } from './product.controller';
import { authenticate, authorize } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validate.middleware';
import {
  createProductSchema,
  productIdSchema,
  productQuerySchema,
  updateProductSchema,
} from './validators/product.schema';

export const createProductRouter = (productController: ProductController) => {
  const router = Router();
  const authenticatedRoles = authorize(UserRole.USER, UserRole.ADMIN, UserRole.DELIVERY);
  const adminOnly = authorize(UserRole.ADMIN);

  router.post('/', authenticate, adminOnly, validate(createProductSchema), (req, res, next) => productController.create(req, res, next));
  router.get('/', authenticate, authenticatedRoles, validate({ query: productQuerySchema }), (req, res, next) => productController.findAll(req, res, next));
  router.get('/slug/:slug', authenticate, authenticatedRoles, (req, res, next) => productController.findBySlug(req, res, next));
  router.get('/:id', authenticate, authenticatedRoles, validate({ params: productIdSchema }), (req, res, next) => productController.findById(req, res, next));
  router.patch('/:id', authenticate, adminOnly, validate({ params: productIdSchema, body: updateProductSchema }), (req, res, next) => productController.update(req, res, next));
  router.delete('/:id', authenticate, adminOnly, validate({ params: productIdSchema }), (req, res, next) => productController.delete(req, res, next));

  return router;
};
