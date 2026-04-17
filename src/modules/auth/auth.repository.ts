import { PrismaClient, User, AuthProvider } from '@prisma/client';
import { RegisterDto, OAuthProfile } from './dtos/auth.dto';

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: RegisterDto & { password: string }): Promise<User>;
  findUserByProvider(provider: AuthProvider, providerUserId: string): Promise<User | null>;
  linkProvider(userId: string, provider: AuthProvider, providerUserId: string): Promise<void>;
  createOAuthUser(profile: OAuthProfile, provider: AuthProvider, email: string): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
}

export class AuthRepository implements IAuthRepository {
  constructor(private prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: RegisterDto & { password: string }): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async findUserByProvider(provider: AuthProvider, providerUserId: string): Promise<User | null> {
    const providerRecord = await this.prisma.userProvider.findFirst({
      where: {
        provider,
        providerUserId,
      },
      include: { user: true },
    });

    return providerRecord?.user ?? null;
  }

  async linkProvider(userId: string, provider: AuthProvider, providerUserId: string): Promise<void> {
    await this.prisma.userProvider.create({
      data: {
        userId,
        provider,
        providerUserId,
      },
    });
  }

  async createOAuthUser(profile: OAuthProfile, provider: AuthProvider, email: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: profile.displayName,
          profileImage: profile.photos?.[0]?.value,
        },
      });

      await tx.userProvider.create({
        data: {
          userId: user.id,
          provider,
          providerUserId: profile.id,
        },
      });

      return user;
    });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }
}
