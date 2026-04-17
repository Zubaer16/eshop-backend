import { InMemoryProductRepository } from './modules/products/repositories/InMemoryProductRepository';
import { GetProductsUseCase } from './modules/products/services/GetProductsUseCase';
import { ProductController } from './modules/products/controllers/ProductController';

// Composition Root
const productRepository = new InMemoryProductRepository();
const getProductsUseCase = new GetProductsUseCase(productRepository);
const productController = new ProductController(getProductsUseCase);

export { productController };
