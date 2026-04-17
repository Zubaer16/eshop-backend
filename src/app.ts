import express from 'express';
import passport from 'passport';
import { container } from './container';
import { errorHandler } from './shared/middlewares/error.middleware';

const app = express();

app.use(express.json());
app.use(passport.initialize());

app.use('/api/v1/auth', container.authRouter);
app.use(errorHandler);

export default app;
