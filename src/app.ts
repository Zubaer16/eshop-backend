import express from 'express';
import { setupSwagger } from './config/swagger';
import { config } from './config';
import { buildApiRouter } from './routes';
import { helmetMiddleware } from './shared/middlewares/helmet';
import { corsMiddleware } from './shared/middlewares/cors';
import { requestIdMiddleware } from './shared/middlewares/request-id.middleware';
import { requestLoggerMiddleware } from './shared/middlewares/request-logger.middleware';
import { globalErrorHandler, notFoundHandler } from './shared/errors/global-handler';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  setupSwagger(app);

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'eshop-backend',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        message: 'EShop Backend API',
        docs: '/api-docs',
        health: '/health',
      },
    });
  });

  app.use(config.constants.API_PREFIX, buildApiRouter());

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
};

export default createApp();
