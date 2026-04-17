import express from 'express';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';
import { swaggerSpec } from './docs';

const app = express();

app.use(express.json());
app.use(passport.initialize());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/auth', container.authRouter);
app.use(errorHandler);

export default app;
