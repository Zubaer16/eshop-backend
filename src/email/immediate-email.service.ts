import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { waitUntil } from '@vercel/functions'
import { Environment } from '../config/environment'
import { EmailQueue } from './email-queue.service'
import { EmailDispatcher } from './email-dispatcher.service'

@Injectable()
export class ImmediateEmail {
  private readonly logger = new Logger(ImmediateEmail.name)

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly queue: EmailQueue,
    private readonly dispatcher: EmailDispatcher,
  ) {}

  start(eventId: string) {
    if (this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) === 'disabled')
      return
    // Issuance has committed. Existing outbox receipts and delivery leases also
    // serialize this request-scoped attempt against scheduled recovery.
    const work = this.process(eventId).catch(() => {
      this.logger.warn(
        'Immediate email processing deferred to durable recovery',
      )
    })
    waitUntil(work)
  }

  private async process(eventId: string) {
    const since = new Date(0)
    await this.queue.queue(since, 1, true, eventId)
    await this.dispatcher.dispatch(since, 1, true, eventId)
  }
}
