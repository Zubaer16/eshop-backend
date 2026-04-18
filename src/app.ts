import express from 'express';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';

const app = express();

const swaggerSpec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'swagger.json'), 'utf-8')) as object;
logger.info(`Swagger UI available at http://localhost:${process.env.PORT || 3000}/api-docs`);

app.use(express.json());
app.use(passport.initialize());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/v1/auth', container.authRouter);
app.use(errorHandler);

export default app;
