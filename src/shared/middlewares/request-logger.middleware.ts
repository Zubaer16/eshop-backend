import { NextFunction, Request, Response } from 'express';
import logger from '../../config/logger';

const ignoredLogPaths = [
  '/api-docs',
  '/api-docs/',
  '/swagger-ui',
  '/favicon.ico',
];

const shouldSkipRequestLog = (path: string) => {
  return ignoredLogPaths.some((ignoredPath) =>
    path === ignoredPath || path.startsWith(`${ignoredPath}/`),
  );
};

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (shouldSkipRequestLog(req.originalUrl)) {
    return next();
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'HTTP request completed',
    );
  });

  next();
};
