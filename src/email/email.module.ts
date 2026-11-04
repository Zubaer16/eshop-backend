import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import { EmailAdminController } from './email.controller'
import { EmailAdminService } from './email-admin.service'
import { EmailQueue } from './email-queue.service'
import { EmailDispatcher } from './email-dispatcher.service'
import { EmailProvider } from './email.provider'
import { SmtpEmailProvider } from './smtp-email.provider'
@Module({
  imports: [AuthModule],
  controllers: [EmailAdminController],
  providers: [
    EmailAdminService,
    EmailQueue,
    EmailDispatcher,
    NotificationOwnerGuard,
    { provide: EmailProvider, useClass: SmtpEmailProvider },
  ],
  exports: [EmailQueue, EmailDispatcher],
})
export class EmailModule {}
