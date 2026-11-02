import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import type { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class PromotionsManageGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (
      actor?.role !== 'OWNER' &&
      !actor?.permissions?.includes('marketing.manage')
    )
      throw new ForbiddenException('marketing.manage permission required')
    return true
  }
}
