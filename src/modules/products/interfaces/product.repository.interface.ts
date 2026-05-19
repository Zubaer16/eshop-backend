import { Product } from '@prisma/client';
import { CreateProductDto, UpdateProductDto, ProductListQuery, ProductWithRelations } from '../dtos/product.dto';

export interface IProductRepository {
  create(data: CreateProductDto): Promise<Product>;
  findById(id: string): Promise<ProductWithRelations | null>;
  findBySlug(slug: string): Promise<ProductWithRelations | null>;
  findAll(query: ProductListQuery): Promise<{ products: ProductWithRelations[]; total: number }>;
  update(id: string, data: UpdateProductDto): Promise<Product>;
  delete(id: string): Promise<void>;
  findByCategory(categoryId: string): Promise<Product[]>;
}