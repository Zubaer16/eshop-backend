import { NextFunction, Request, Response } from 'express';
import { ProductService } from './product.service';
import { CreateProductDto, ProductListQuery, UpdateProductDto } from './dtos/product.dto';
import { AppError } from '@/shared/errors/app-error';

export class ProductController {
  constructor(private productService: ProductService) {}

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await this.productService.create(req.body as CreateProductDto);
      res.status(201).json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.productService.findAll(
        req.query as unknown as ProductListQuery,
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const product = await this.productService.findById(id);

      if (!product) {
        return next(new AppError('Product not found', 404));
      }

      res.status(200).json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  async findBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params as { slug: string };
      const product = await this.productService.findBySlug(slug);

      if (!product) {
        return next(new AppError('Product not found', 404));
      }

      res.status(200).json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const product = await this.productService.update(
        id,
        req.body as UpdateProductDto,
      );

      res.status(200).json({ success: true, data: { product } });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      await this.productService.delete(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
