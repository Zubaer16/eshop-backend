import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  originalPrice: z.number(),
  salePrice: z.number().nullable().optional(),
  stock: z.number().int(),
  categoryId: z.string().uuid(),
  isOnSale: z.boolean(),
  saleStartDate: z.string().datetime().nullable().optional(),
  saleEndDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('Product');

export const productEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    product: productResponseSchema,
  }),
}).openapi('ProductResponse');

export const paginatedProductsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    products: z.array(productResponseSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  }),
}).openapi('PaginatedProductsResponse');
