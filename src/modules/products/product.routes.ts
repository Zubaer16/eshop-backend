import { Router } from 'express';
import { ProductController } from './product.controller';
import { authenticate, authorize } from '@/shared/middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

export const createProductRouter = (productController: ProductController) => {
  const router = Router();

  router.post('/', authenticate, authorize(UserRole.ADMIN), (req, res, next) => productController.create(req, res, next));
  router.get('/', authenticate, authorize(UserRole.USER, UserRole.ADMIN, UserRole.DELIVERY), (req, res, next) => productController.findAll(req, res, next));
  router.get('/:id', authenticate, authorize(UserRole.USER, UserRole.ADMIN, UserRole.DELIVERY), (req, res, next) => productController.findById(req, res, next));
  router.get('/slug/:slug', authenticate, authorize(UserRole.USER, UserRole.ADMIN, UserRole.DELIVERY), (req, res, next) => productController.findBySlug(req, res, next));
  router.patch('/:id', authenticate, authorize(UserRole.ADMIN), (req, res, next) => productController.update(req, res, next));
  router.delete('/:id', authenticate, authorize(UserRole.ADMIN), (req, res, next) => productController.delete(req, res, next));

  return router;
};