import { NextFunction, Request, Response } from 'express';
import { ProductService } from './product.service';
import { createSchema, updateSchema, listSchema } from './validators/product.schema';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/app-error';

export class ProductController {
  constructor(private productService: ProductService) {}

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createSchema.parse(req.body);
      const product = await this.productService.create(validatedData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedQuery = listSchema.parse(req.query);
      const result = await this.productService.findAll(validatedQuery);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await this.productService.findById(id as string);
      if (!product) {
        return next(new AppError('Product not found', 404));
      }
      res.status(200).json(product);
    } catch (error) {
      next(error);
    }
  }

  async findBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const product = await this.productService.findBySlug(slug as string);
      if (!product) {
        return next(new AppError('Product not found', 404));
      }
      res.status(200).json(product);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updateSchema.parse(req.body);
      const product = await this.productService.update(id as string, validatedData);
      res.status(200).json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await this.productService.delete(id as string);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}