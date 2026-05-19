import { User, AuthProvider } from '@prisma/client';
import { RegisterDto, OAuthProfile } from '../dtos/auth.dto';

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: RegisterDto & { password: string }): Promise<User>;
  findUserByProvider(provider: AuthProvider, providerUserId: string): Promise<User | null>;
  linkProvider(userId: string, provider: AuthProvider, providerUserId: string): Promise<void>;
  createOAuthUser(profile: OAuthProfile, provider: AuthProvider, email: string): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
}