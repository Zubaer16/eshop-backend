import express from 'express';
import passport from 'passport';
import { setupSwaggerUI } from './config/swagger-generator';
import { startSwaggerWatcher } from './config/swagger-watcher';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(passport.initialize());

setupSwaggerUI(app);

if (process.env.NODE_ENV !== 'production') {
  startSwaggerWatcher(app);
}

app.use('/api/v1/auth', container.authRouter);
app.use('/api/v1/products', container.productRouter);
app.use(errorHandler);

export default app;
