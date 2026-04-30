import express from 'express';
import passport from 'passport';
import { setupSwaggerUI } from './config/swagger-generator';
import { startSwaggerWatcher } from './config/swagger-watcher';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';

const app = express();

app.use(express.json());
app.use(passport.initialize());

setupSwaggerUI(app);

if (process.env.NODE_ENV !== 'production') {
  startSwaggerWatcher(app);
}

app.use('/api/v1/auth', container.authRouter);
app.use(errorHandler);

export default app;
