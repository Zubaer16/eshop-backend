import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// Prisma Decimal may serialize differently depending on the runtime/output layer.
// The current API can safely document prices as number or string until a response
// mapper normalizes Decimal values into one fixed JSON shape.
const decimalJsonSchema = z.union([z.number(), z.string()]);

export const productCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).openapi('ProductCategory');

export const productImageResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  url: z.string(),
  isPrimary: z.boolean(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).openapi('ProductImage');

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  originalPrice: decimalJsonSchema,
  salePrice: decimalJsonSchema.nullable().optional(),
  stock: z.number().int(),
  categoryId: z.string().uuid(),
  isOnSale: z.boolean(),
  saleStartDate: z.string().datetime().nullable().optional(),
  saleEndDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  category: productCategoryResponseSchema.optional(),
  images: z.array(productImageResponseSchema).optional(),
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
