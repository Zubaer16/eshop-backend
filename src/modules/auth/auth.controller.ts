import { NextFunction, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from '../../infrastructure/auth/token.service';
import { registerSchema, loginSchema, refreshSchema } from './validators/auth.schema';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/app-error';

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const user = await this.authService.register(validatedData);
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await this.authService.login(validatedData);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = refreshSchema.parse(req.body);
      const user = await this.authService.validateRefreshToken(validatedData.refreshToken);
      const accessToken = TokenService.generateAccessToken(user.id, user.role);

      res.status(200).json({ accessToken });
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(error.issues[0]?.message || 'Validation failed', 400));
      }
      next(error);
    }
  }

  oauthSuccess(req: Request, res: Response) {
    res.status(200).json({
      message: 'OAuth authentication successful',
      user: req.user,
    });
  }
}
