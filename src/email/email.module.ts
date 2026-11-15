import { EmailDeliveryModule } from './email-delivery.module'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import { EmailAdminController } from './email.controller'
import { EmailAdminService } from './email-admin.service'
@Module({
  imports: [AuthModule, EmailDeliveryModule],
  controllers: [EmailAdminController],
  providers: [EmailAdminService, NotificationOwnerGuard],
  exports: [EmailDeliveryModule],
})
export class EmailModule {}
