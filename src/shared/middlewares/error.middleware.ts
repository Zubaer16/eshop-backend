import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return res.status(500).json({ message });
};
