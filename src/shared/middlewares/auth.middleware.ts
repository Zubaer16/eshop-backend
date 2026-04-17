import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../infrastructure/auth/token.service';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../../modules/auth/dtos/auth.dto';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is missing'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = TokenService.verifyAccessToken(token) as JwtPayload;
    req.authUser = {
      userId: decoded.userId,
      role: decoded.role,
    };
    next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return next(new UnauthorizedError('User not authenticated'));
    }

    if (!roles.includes(req.authUser.role)) {
      return next(new ForbiddenError('Forbidden: Insufficient permissions'));
    }

    next();
  };
};
