import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from '../auth/permissions/permissions.service'
import type { PermissionKey } from '../auth/permissions/permissions'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { reportPermissions, type ExportKind } from './reporting.policy'
const key = 'report-required-permissions'
export const ReportAccess = (...permissions: PermissionKey[]) =>
  SetMetadata(key, permissions)
export const ReportExportAccess = () => SetMetadata(key, 'export')
@Injectable()
export class ReportsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}
  canActivate(context: ExecutionContext) {
    const request = context
        .switchToHttp()
        .getRequest<AuthenticatedRequest & { params: { kind?: string } }>(),
      rule = this.reflector.getAllAndOverride<
        readonly PermissionKey[] | 'export'
      >(key, [context.getHandler(), context.getClass()])
    let required: readonly PermissionKey[] | undefined
    if (rule === 'export') {
      const kind = request.params.kind
      if (!kind || !Object.hasOwn(reportPermissions, kind))
        throw new BadRequestException('Unknown export kind')
      required = reportPermissions[kind as ExportKind]
    } else required = rule
    if (!required?.length || !request.authUser)
      throw new ForbiddenException('Report permissions not configured')
    for (const permission of required)
      this.permissions.assert(request.authUser, permission)
    return true
  }
}
