import { IProductRepository } from './product.repository';
import { CreateProductDto, UpdateProductDto, ProductWithRelations, PaginatedProducts, ProductListQuery } from './dtos/product.dto';

export class ProductService {
  constructor(private productRepository: IProductRepository) {}

  async create(data: CreateProductDto): Promise<ProductWithRelations> {
    const product = await this.productRepository.create(data);
    return this.productRepository.findById(product.id) as Promise<ProductWithRelations>;
  }

  async findAll(query: ProductListQuery): Promise<PaginatedProducts> {
    const { products, total } = await this.productRepository.findAll(query);
    const totalPages = Math.ceil(total / query.limit);
    return { products, total, page: query.page, limit: query.limit, totalPages };
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    return this.productRepository.findById(id);
  }

  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    return this.productRepository.findBySlug(slug);
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductWithRelations> {
    await this.productRepository.update(id, data);
    return this.productRepository.findById(id) as Promise<ProductWithRelations>;
  }

  async delete(id: string): Promise<void> {
    await this.productRepository.delete(id);
  }
}