import { NextFunction, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from '../../infrastructure/auth/token.service';
import { OAuthLoginDto, RegisterDto, LoginDto } from './dtos/auth.dto';

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await this.authService.register(req.body as RegisterDto);

      res.status(201).json({
        success: true,
        data: {
          message: 'User registered successfully',
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.authService.login(req.body as LoginDto);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body as { refreshToken: string };
      const user = await this.authService.validateRefreshToken(refreshToken);
      const accessToken = TokenService.generateAccessToken(user.id, user.role);

      res.status(200).json({ success: true, data: { accessToken } });
    } catch (error) {
      next(error);
    }
  }

  async oauthLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = req.params.provider as string;
      const result = await this.authService.oauthLogin(
        provider,
        req.body as OAuthLoginDto,
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  oauthSuccess(req: Request, res: Response) {
    const user = req.user as { id: string; role: string; email: string; name?: string } | undefined;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not found' },
      });
    }

    const accessToken = TokenService.generateAccessToken(user.id, user.role);
    const refreshToken = TokenService.generateRefreshToken(user.id);

    res.status(200).json({
      success: true,
      data: {
        message: 'OAuth authentication successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        },
        accessToken,
        refreshToken,
      },
    });
  }
}
