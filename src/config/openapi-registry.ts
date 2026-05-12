import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registerSchema, loginSchema, refreshSchema } from '@/modules/auth/validators/auth.schema';
import { createProductSchema, updateProductSchema } from '@/modules/products/validators/product.schema';

extendZodWithOpenApi(z);

const Error = z.object({
  message: z.string(),
  statusCode: z.number().int(),
});

const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN', 'DELIVERY']),
  name: z.string(),
});

const RegisterResponse = z.object({
  message: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['USER', 'ADMIN', 'DELIVERY']),
  }),
});

const TokenResponse = z.object({
  user: User,
  accessToken: z.string(),
  refreshToken: z.string(),
});

const RefreshResponse = z.object({
  accessToken: z.string(),
});

const OAuthResponse = z.object({
  message: z.string(),
  user: User,
  accessToken: z.string(),
  refreshToken: z.string(),
});

const Product = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  originalPrice: z.number(),
  salePrice: z.number().nullable(),
  stock: z.number().int(),
  categoryId: z.string().uuid(),
  isOnSale: z.boolean(),
  saleStartDate: z.string().datetime().nullable(),
  saleEndDate: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const PaginatedProducts = z.object({
  products: z.array(Product),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const registry = new OpenAPIRegistry();

registry.register('Error', Error);
registry.register('User', User);
registry.register('RegisterResponse', RegisterResponse);
registry.register('TokenResponse', TokenResponse);
registry.register('RefreshResponse', RefreshResponse);
registry.register('OAuthResponse', OAuthResponse);
registry.register('Product', Product);
registry.register('PaginatedProducts', PaginatedProducts);

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  summary: 'Register a new user (PUBLIC)',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: registerSchema } },
    },
  },
  responses: {
    201: {
      description: 'User registered successfully',
      content: { 'application/json': { schema: RegisterResponse } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: Error } },
    },
    409: {
      description: 'User already exists',
      content: { 'application/json': { schema: Error } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  summary: 'Login with email and password (PUBLIC)',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: loginSchema } },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: { 'application/json': { schema: TokenResponse } },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: Error } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  summary: 'Refresh access token (PUBLIC)',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: refreshSchema } },
    },
  },
  responses: {
    200: {
      description: 'Token refreshed successfully',
      content: { 'application/json': { schema: RefreshResponse } },
    },
    401: {
      description: 'Invalid refresh token',
      content: { 'application/json': { schema: Error } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/google',
  summary: 'Initiate Google OAuth flow (PUBLIC)',
  tags: ['Auth'],
  responses: {
    302: { description: 'Redirects to Google consent screen' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/google/callback',
  summary: 'Google OAuth callback (PUBLIC)',
  tags: ['Auth'],
  responses: {
    200: {
      description: 'OAuth authentication successful',
      content: { 'application/json': { schema: OAuthResponse } },
    },
    401: {
      description: 'Authentication failed',
      content: { 'application/json': { schema: Error } },
    },
  },
});

const productListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('Page number'),
  limit: z.coerce.number().int().min(1).max(100).default(10).describe('Items per page'),
  search: z.string().optional().describe('Search term'),
  categoryId: z.string().uuid().optional().describe('Filter by category'),
  minPrice: z.coerce.number().min(0).optional().describe('Minimum price'),
  maxPrice: z.coerce.number().min(0).optional().describe('Maximum price'),
  inStock: z.enum(['true', 'false']).optional().describe('Filter by stock availability'),
  onSale: z.enum(['true', 'false']).optional().describe('Filter by sale items'),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/products',
  summary: 'Get all products (USER, ADMIN, DELIVERY)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    query: productListQuery,
  },
  responses: {
    200: {
      description: 'Products retrieved successfully',
      content: { 'application/json': { schema: PaginatedProducts } },
    },
    401: { description: 'Unauthorized' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/products',
  summary: 'Create a new product (ADMIN)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: createProductSchema } },
    },
  },
  responses: {
    201: {
      description: 'Product created successfully',
      content: { 'application/json': { schema: Product } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Admin only' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/products/{id}',
  summary: 'Get product by ID (USER, ADMIN, DELIVERY)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Product retrieved successfully',
      content: { 'application/json': { schema: Product } },
    },
    404: { description: 'Product not found' },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/products/{id}',
  summary: 'Update a product (ADMIN)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: updateProductSchema } },
    },
  },
  responses: {
    200: {
      description: 'Product updated successfully',
      content: { 'application/json': { schema: Product } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Admin only' },
    404: { description: 'Product not found' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/products/{id}',
  summary: 'Delete a product (ADMIN)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: 'Product deleted successfully (no content)' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Admin only' },
    404: { description: 'Product not found' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/products/slug/{slug}',
  summary: 'Get product by slug (USER, ADMIN, DELIVERY)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
  },
  responses: {
    200: {
      description: 'Product retrieved successfully',
      content: { 'application/json': { schema: Product } },
    },
    404: { description: 'Product not found' },
  },
});
