import { ProductDto } from '../dtos/ProductDto';
import { IProductRepository } from './IProductRepository';

export class InMemoryProductRepository implements IProductRepository {
  private products: ProductDto[] = [
    { id: '1', name: 'Laptop', price: 1000, description: 'High performance laptop' },
    { id: '2', name: 'Mouse', price: 50, description: 'Wireless mouse' },
  ];

  async save(product: ProductDto): Promise<ProductDto> {
    this.products.push(product);
    return product;
  }

  async findById(id: string): Promise<ProductDto | null> {
    return this.products.find(p => p.id === id) || null;
  }

  async findAll(): Promise<ProductDto[]> {
    return this.products;
  }

  async delete(id: string): Promise<void> {
    this.products = this.products.filter(p => p.id !== id);
  }
}
