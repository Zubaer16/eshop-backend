import { z } from 'zod';

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
});

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
});

export const productIdSchema = z.object({
  id: z.string().uuid(),
});

export const productQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
  onSale: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const createSchema = createProductSchema;
export const updateSchema = updateProductSchema;
export const listSchema = productQuerySchema;