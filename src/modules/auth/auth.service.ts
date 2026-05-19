import bcrypt from 'bcrypt';
import { IAuthRepository } from './interfaces/auth.repository.interface';
import { TokenService } from '../../infrastructure/auth/token.service';
import { User } from '@prisma/client';
import { RegisterDto, LoginDto, TokenResponse, RefreshJwtPayload, OAuthLoginDto } from './dtos/auth.dto';
import { ConflictError, UnauthorizedError } from '@/shared/errors/app-error';
import { googleOAuthClient, GoogleOAuthProfile as GoogleProfile } from '../../infrastructure/oauth/google.oauth';
import logger from '@/config/logger';

export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(private authRepository: IAuthRepository) {}

  async register(userData: RegisterDto): Promise<User> {
    const existingUser = await this.authRepository.findUserByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    const hashedPassword = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

    const user = await this.authRepository.createUser({
      ...userData,
      password: hashedPassword,
    });

    logger.info({ userId: user.id, email: user.email }, 'User registered');
    return user;
  }

  async login(credentials: LoginDto): Promise<TokenResponse> {
    const user = await this.authRepository.findUserByEmail(credentials.email);
    if (!user || !user.password) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const accessToken = TokenService.generateAccessToken(user.id, user.role);
    const refreshToken = TokenService.generateRefreshToken(user.id);

    logger.info({ userId: user.id, email: user.email }, 'User logged in');

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      accessToken,
      refreshToken,
    };
  }

  async validateRefreshToken(token: string): Promise<User> {
    let decoded: RefreshJwtPayload;

    try {
      decoded = TokenService.verifyRefreshToken(token) as RefreshJwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await this.authRepository.findUserById(decoded.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    return user;
  }

  async oauthLogin(provider: string, dto: OAuthLoginDto): Promise<TokenResponse> {
    let profile: GoogleProfile;

    if (provider !== 'google') {
      throw new Error('Unsupported OAuth provider');
    }

    if (dto.idToken) {
      profile = await googleOAuthClient.getProfileFromIdToken(dto.idToken);
    } else if (dto.code) {
      profile = await googleOAuthClient.exchangeCodeForProfile(
        dto.code,
        dto.redirectUri
      );
    } else {
      throw new Error('code or idToken is required');
    }

    if (!profile.email) {
      throw new Error('Missing email in OAuth profile');
    }

    if (!profile.emailVerified) {
      throw new Error('Email not verified');
    }

    let user = await this.authRepository.findUserByProvider('GOOGLE', profile.sub);

    if (!user) {
      const existingByEmail = await this.authRepository.findUserByEmail(profile.email);
      if (existingByEmail) {
        user = await this.authRepository.updateUser(existingByEmail.id, {
          name: profile.name || existingByEmail.name,
        });
        await this.authRepository.linkProvider(existingByEmail.id, 'GOOGLE', profile.sub);
      } else {
        user = await this.authRepository.createOAuthUser(
          {
            id: profile.sub,
            displayName: profile.name || profile.email,
            emails: [{ value: profile.email }],
            photos: profile.picture ? [{ value: profile.picture }] : undefined,
          },
          'GOOGLE',
          profile.email
        );
      }
    }

    logger.info({ userId: user.id, email: user.email, provider }, 'OAuth login');

    const accessToken = TokenService.generateAccessToken(user.id, user.role);
    const refreshToken = TokenService.generateRefreshToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      accessToken,
      refreshToken,
    };
  }
}
