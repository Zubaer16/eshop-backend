import { NextFunction, Request, Response } from 'express';
import { AppError } from './app-error';
import logger from '../../config/logger';

type HttpParserError = Error & {
  status?: number;
  statusCode?: number;
  expose?: boolean;
};

const isHttpParserError = (error: Error): error is HttpParserError => {
  const candidate = error as HttpParserError;
  return (
    typeof candidate.statusCode === 'number' ||
    typeof candidate.status === 'number'
  );
};

export const globalErrorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = 500;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (isHttpParserError(error)) {
    statusCode = error.statusCode ?? error.status ?? statusCode;
    message = error.expose || statusCode < 500 ? error.message : message;
  }

  logger.error(
    {
      err: error,
      requestId: req.requestId,
      statusCode,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
    'Request error',
  );

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
      }),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};
