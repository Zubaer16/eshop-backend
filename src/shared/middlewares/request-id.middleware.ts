import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const incomingRequestId = req.header('x-request-id');
  const requestId = incomingRequestId || randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
