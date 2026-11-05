import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CheckoutModule } from '../checkout/checkout.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { EmailModule } from '../email/email.module'
import { PushModule } from '../push/push.module'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import { JobsService } from './jobs.service'
import { JobsOperationsService } from './jobs-operations.service'
import { JobsAdminController, JobsCronController } from './jobs.controller'
@Module({
  imports: [
    AuthModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    MediaModule,
    NotificationsModule,
    EmailModule,
    PushModule,
  ],
  providers: [JobsService, JobsOperationsService, NotificationOwnerGuard],
  controllers: [JobsAdminController, JobsCronController],
  exports: [JobsService],
})
export class JobsModule {}
