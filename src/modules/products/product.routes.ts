import { Router } from 'express';
import { ProductController } from './product.controller';

export const createProductRouter = (productController: ProductController) => {
  const router = Router();

  router.post('/', (req, res, next) => productController.create(req, res, next));
  router.get('/', (req, res, next) => productController.findAll(req, res, next));
  router.get('/:id', (req, res, next) => productController.findById(req, res, next));
  router.get('/slug/:slug', (req, res, next) => productController.findBySlug(req, res, next));
  router.patch('/:id', (req, res, next) => productController.update(req, res, next));
  router.delete('/:id', (req, res, next) => productController.delete(req, res, next));

  return router;
};