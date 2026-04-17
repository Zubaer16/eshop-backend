import { AuthUser } from '@/modules/auth/dtos/auth.dto';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
