import { UserRole } from '@prisma/client';

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  phone?: string;
  profileImage?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface TokenResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

export interface AuthUser {
  userId: string;
  role: UserRole;
}

export interface RefreshJwtPayload {
  userId: string;
}

export interface OAuthProfile {
  id: string;
  displayName: string;
  emails?: { value: string }[];
  photos?: { value: string }[];
}
