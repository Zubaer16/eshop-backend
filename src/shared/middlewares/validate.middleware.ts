import { NextFunction, Request, Response } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../errors/app-error';

type RequestSchema = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

const toAppError = (error: ZodError) =>
  new AppError(error.issues[0]?.message || 'Validation failed', 400);

export const validate = (schema: ZodTypeAny | RequestSchema) => {
  const normalized: RequestSchema = schema instanceof z.ZodType
    ? { body: schema }
    : schema;

  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (normalized.body) req.body = normalized.body.parse(req.body);
      if (normalized.query) req.query = normalized.query.parse(req.query) as Request['query'];
      if (normalized.params) req.params = normalized.params.parse(req.params) as Request['params'];

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(toAppError(error));
      }

      next(error);
    }
  };
};
