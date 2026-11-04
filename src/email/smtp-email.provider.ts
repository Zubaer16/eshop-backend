import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'
import { Environment } from '../config/environment'
import {
  EmailMessage,
  EmailProvider,
  EmailSubmissionError,
} from './email.provider'
@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  constructor(private readonly config: ConfigService<Environment, true>) {
    super()
  }
  async submit(message: EmailMessage): Promise<void> {
    if (this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) === 'disabled')
      throw new EmailSubmissionError('PERMANENT', 'EMAIL_DISABLED')
    if (
      this.config.get('EMAIL_DELIVERY_MODE', { infer: true }) ===
        'controlled' &&
      !this.config
        .get('EMAIL_RECIPIENT_ALLOWLIST', { infer: true })
        .split(',')
        .includes(message.to.toLowerCase())
    )
      throw new EmailSubmissionError('PERMANENT', 'RECIPIENT_NOT_ALLOWLISTED')
    const port = this.config.get('EMAIL_SMTP_PORT', { infer: true })
    const transport = nodemailer.createTransport({
      host: this.config.get('EMAIL_SMTP_HOST', { infer: true }),
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: {
        user: this.config.get('EMAIL_SMTP_USER', { infer: true }),
        pass: this.config.get('EMAIL_SMTP_PASSWORD', { infer: true }),
      },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      pool: false,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    })
    try {
      const from = this.config.get('EMAIL_FROM_ADDRESS', { infer: true })
      const response = await transport.sendMail({
        from: {
          name: this.config.get('EMAIL_FROM_NAME', { infer: true }),
          address: from,
        },
        to: [{ address: message.to, name: '' }],
        replyTo:
          this.config.get('EMAIL_REPLY_TO', { infer: true }) || undefined,
        subject: message.subject,
        text: message.text,
        messageId: '<' + message.deliveryId + '@' + from.split('@')[1] + '>',
        envelope: { from, to: [message.to] },
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      if (
        !response.accepted?.some(
          (address) =>
            typeof address === 'string' &&
            address.toLowerCase() === message.to.toLowerCase(),
        )
      )
        throw new EmailSubmissionError('PERMANENT', 'SMTP_RECIPIENT_REJECTED')
    } catch (error) {
      if (error instanceof EmailSubmissionError) throw error
      const e = error as {
        code?: string
        command?: string
        responseCode?: number
      }
      if (e.code === 'EAUTH')
        throw new EmailSubmissionError('PERMANENT', 'SMTP_AUTH_FAILED')
      if (e.responseCode && e.responseCode >= 400 && e.responseCode < 600)
        throw new EmailSubmissionError(
          e.responseCode < 500 ? 'RETRYABLE' : 'PERMANENT',
          'SMTP_REJECTED',
        )
      if (
        ['EDNS', 'ECONNECTION', 'ETLS'].includes(e.code ?? '') ||
        (e.code === 'ETIMEDOUT' &&
          ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH'].includes(
            e.command ?? '',
          ))
      )
        throw new EmailSubmissionError('RETRYABLE', 'SMTP_CONNECTION_FAILED')
      throw new EmailSubmissionError('UNCERTAIN', 'SMTP_SUBMISSION_UNCERTAIN')
    } finally {
      transport.close()
    }
  }
}
