import { ProductDto } from '../dtos/ProductDto';

export interface IProductRepository {
  findAll(): Promise<ProductDto[]>;
  findById(id: string): Promise<ProductDto | null>;
  save(product: ProductDto): Promise<ProductDto>;
  delete(id: string): Promise<void>;
}
