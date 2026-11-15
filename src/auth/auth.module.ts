import { EmailDeliveryModule } from '../email/email-delivery.module'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AccessGuard } from './access.guard'
import { AdminGuard } from './admin.guard'
import { AdminAuthController } from './admin-auth.controller'
import { CustomerAuthController } from './customer-auth.controller'
import { PermissionsService } from './permissions/permissions.service'
import { WorkspaceController } from './workspace/workspace.controller'
import { WorkspaceService } from './workspace/workspace.service'

@Module({
  imports: [JwtModule.register({}), EmailDeliveryModule],
  controllers: [
    CustomerAuthController,
    AdminAuthController,
    WorkspaceController,
  ],
  providers: [
    AuthService,
    AccessGuard,
    AdminGuard,
    PermissionsService,
    WorkspaceService,
  ],
  exports: [JwtModule, AccessGuard, AdminGuard, PermissionsService],
})
export class AuthModule {}
