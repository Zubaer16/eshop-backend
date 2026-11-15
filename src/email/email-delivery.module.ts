import { Module } from '@nestjs/common'
import { EmailQueue } from './email-queue.service'
import { EmailDispatcher } from './email-dispatcher.service'
import { EmailProvider } from './email.provider'
import { SmtpEmailProvider } from './smtp-email.provider'
import { ImmediateEmail } from './immediate-email.service'

@Module({
  providers: [
    EmailQueue,
    EmailDispatcher,
    ImmediateEmail,
    { provide: EmailProvider, useClass: SmtpEmailProvider },
  ],
  exports: [EmailQueue, EmailDispatcher, ImmediateEmail],
})
export class EmailDeliveryModule {}
