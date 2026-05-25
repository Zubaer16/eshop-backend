import cors from 'cors';
import { config } from '../../config';
import logger from '../../config/logger';

export const corsMiddleware = () =>
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const allowedOrigins = config.app.corsOrigin;
      const isAllowed = allowedOrigins.includes(origin);

      if (!isAllowed) {
        logger.warn(
          { origin, allowedOrigins },
          'CORS rejected origin',
        );
      }

      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    optionsSuccessStatus: 204,
  });
