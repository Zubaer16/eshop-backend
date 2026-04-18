import { envConfig } from '../../../config/env';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

const accessTokenOptions: SignOptions = {
  expiresIn: envConfig.JWT_ACCESS_EXPIRATION as SignOptions['expiresIn'],
};

const refreshTokenOptions: SignOptions = {
  expiresIn: envConfig.JWT_REFRESH_EXPIRATION as SignOptions['expiresIn'],
};

export class TokenService {
  static generateAccessToken(userId: string, role: string): string {
    return jwt.sign(
      { userId, role },
      envConfig.JWT_ACCESS_SECRET as Secret,
      accessTokenOptions
    );
  }

  static generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId },
      envConfig.JWT_REFRESH_SECRET as Secret,
      refreshTokenOptions
    );
  }

  static verifyAccessToken(token: string) {
    return jwt.verify(token, envConfig.JWT_ACCESS_SECRET as Secret);
  }

  static verifyRefreshToken(token: string) {
    return jwt.verify(token, envConfig.JWT_REFRESH_SECRET as Secret);
  }
}
