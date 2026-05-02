import { Product, Category, ProductImage } from '@prisma/client';

export type CreateProductDto = {
  name: string;
  slug: string;
  description?: string;
  originalPrice: number;
  salePrice?: number;
  stock: number;
  categoryId: string;
  isOnSale?: boolean;
  saleStartDate?: string;
  saleEndDate?: string;
  isActive?: boolean;
};

export type UpdateProductDto = Partial<CreateProductDto>;

export type ProductWithRelations = Product & {
  category?: Category;
  images?: ProductImage[];
};

export type ProductListQuery = {
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  page: number;
  limit: number;
};

export type PaginatedProducts = {
  products: ProductWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};