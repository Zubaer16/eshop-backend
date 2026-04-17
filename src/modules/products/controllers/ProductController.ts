import { Request, Response, Router } from 'express';
import { IGetProductsUseCase } from '../repositories/IGetProductsUseCase';

export class ProductController {
  private router = Router();

  constructor(private readonly getProductsUseCase: IGetProductsUseCase) {
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/products', (req: Request, res: Response) => {
      this.handleGetProducts(req, res);
    });
  }

  private async handleGetProducts(req: Request, res: Response): Promise<void> {
    try {
      const products = await this.getProductsUseCase.execute();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}
