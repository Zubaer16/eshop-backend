import { ProductDto } from '../dtos/ProductDto';
import { IProductRepository } from '../repositories/IProductRepository';
import { IGetProductsUseCase } from '../repositories/IGetProductsUseCase';

export class GetProductsUseCase implements IGetProductsUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(): Promise<ProductDto[]> {
    return await this.productRepository.findAll();
  }
}
