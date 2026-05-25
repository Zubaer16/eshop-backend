import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error';

export const requireRoles = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return next(new UnauthorizedError('User not authenticated'));
    }

    if (!roles.includes(req.authUser.role)) {
      return next(new ForbiddenError('Forbidden: Insufficient permissions'));
    }

    next();
  };
};
