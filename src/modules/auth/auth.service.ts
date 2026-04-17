import bcrypt from 'bcrypt';
import { IAuthRepository } from './auth.repository';
import { TokenService } from '../../infrastructure/auth/token.service';
import { User } from '@prisma/client';
import { RegisterDto, LoginDto, TokenResponse, RefreshJwtPayload } from './dtos/auth.dto';
import { ConflictError, UnauthorizedError } from '@/shared/errors/app-error';

export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(private authRepository: IAuthRepository) {}

  async register(userData: RegisterDto): Promise<User> {
    const existingUser = await this.authRepository.findUserByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    const hashedPassword = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

    return this.authRepository.createUser({
      ...userData,
      password: hashedPassword,
    });
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
}
