import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (!user || user.role !== 'CUSTOMER')
      throw new ForbiddenException('A customer account is required')
    return true
  }
}
