import { Router } from 'express';
import { container } from '../container';

export const buildApiRouter = () => {
  const router = Router();

  router.use('/auth', container.authRouter);
  router.use('/products', container.productRouter);

  return router;
};

export default buildApiRouter;
