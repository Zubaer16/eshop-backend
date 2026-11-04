import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  NotificationsAdminController,
  NotificationsController,
  NotificationOwnerGuard,
} from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { NotificationDispatcher } from './notification-dispatcher.service'
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    NotificationOwnerGuard,
  ],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
