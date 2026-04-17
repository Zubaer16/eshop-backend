import { User, AuthProvider } from '@prisma/client';
import { OAuthProfile } from './dtos/auth.dto';
import { IAuthRepository } from './auth.repository';
import { AppError } from '@/shared/errors/app-error';

export class OAuthService {
  constructor(private authRepository: IAuthRepository) {}

  async findOrCreateUser(profile: OAuthProfile, provider: AuthProvider): Promise<User> {
    const providerUserId = profile.id;

    const existingProviderUser = await this.authRepository.findUserByProvider(provider, providerUserId);
    if (existingProviderUser) {
      return existingProviderUser;
    }

    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new AppError('OAuth profile must contain an email', 400);
    }

    const userByEmail = await this.authRepository.findUserByEmail(email);
    if (userByEmail) {
      await this.authRepository.linkProvider(userByEmail.id, provider, providerUserId);
      return userByEmail;
    }

    return this.authRepository.createOAuthUser(profile, provider, email);
  }
}
