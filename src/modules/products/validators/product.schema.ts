import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().optional(),
  originalPrice: z.number().positive(),
  salePrice: z.number().positive().optional(),
  stock: z.number().int().min(0),
  categoryId: z.string().uuid(),
  isOnSale: z.boolean().optional(),
  saleStartDate: z.string().datetime().optional(),
  saleEndDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
}).openapi('CreateProductRequest');

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  originalPrice: z.number().positive().optional(),
  salePrice: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  isOnSale: z.boolean().optional(),
  saleStartDate: z.string().datetime().optional(),
  saleEndDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
}).openapi('UpdateProductRequest');

export const productIdSchema = z.object({
  id: z.string().uuid(),
});

export const productQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  onSale: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).refine(
  (data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
  { message: 'minPrice must be less than or equal to maxPrice', path: ['minPrice'] }
);

export const createSchema = createProductSchema;
export const updateSchema = updateProductSchema;
export const listSchema = productQuerySchema;