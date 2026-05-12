import express from 'express';
import passport from 'passport';
import { setupSwaggerUI } from './config/openapi';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';
import logger from './config/logger';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(passport.initialize());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({ method: req.method, url: req.originalUrl, status: res.statusCode, duration }, 'request');
  });
  next();
});

setupSwaggerUI(app);

app.use('/api/v1/auth', container.authRouter);
app.use('/api/v1/products', container.productRouter);
app.use(errorHandler);

export default app;
