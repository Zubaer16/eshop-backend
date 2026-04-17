import { ProductDto } from '../dtos/ProductDto';

export interface IGetProductsUseCase {
  execute(): Promise<ProductDto[]>;
}
