import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'
import { Environment } from '../config/environment'
import { SmtpEmailProvider } from './smtp-email.provider'
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}))
const message = {
  deliveryId: 'test-id',
  to: 'recipient@example.test',
  subject: 'Security notice',
  text: 'Plain text',
}
function setup(port = 465) {
  const settings: Record<string, unknown> = {
    EMAIL_DELIVERY_MODE: 'controlled',
    EMAIL_RECIPIENT_ALLOWLIST: message.to,
    EMAIL_SMTP_PORT: port,
    EMAIL_FROM_ADDRESS: 'sender@example.test',
    EMAIL_FROM_NAME: 'Store',
    EMAIL_SMTP_HOST: 'smtp.example.test',
    EMAIL_SMTP_USER: 'sender',
    EMAIL_SMTP_PASSWORD: 'secret',
  }
  const transport = {
    sendMail: jest.fn().mockResolvedValue({ accepted: [message.to] }),
    close: jest.fn(),
  }
  ;(nodemailer.createTransport as jest.Mock).mockReturnValue(transport)
  return {
    transport,
    provider: new SmtpEmailProvider({
      get: (key: string) => settings[key],
    } as unknown as ConfigService<Environment, true>),
  }
}
describe('G7 SMTP submission adapter (mocked transport; execution G12)', () => {
  it('uses authenticated TLS and excludes attachments, URLs and protocol logging', async () => {
    const { transport, provider } = setup()
    await provider.submit(message)
    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        secure: true,
        port: 465,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      }),
    )
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: '<test-id@example.test>',
        text: message.text,
        envelope: { from: 'sender@example.test', to: [message.to] },
      }),
    )
    expect(transport.close).toHaveBeenCalled()
  })
  it('requires STARTTLS on port 587', async () => {
    const { provider } = setup(587)
    await provider.submit(message)
    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true }),
    )
  })
  it('distinguishes safe pre-submission retries from ambiguous submission and hard rejection', async () => {
    for (const [error, disposition, code] of [
      [{ code: 'EAUTH' }, 'PERMANENT', 'SMTP_AUTH_FAILED'],
      [{ code: 'EDNS' }, 'RETRYABLE', 'SMTP_CONNECTION_FAILED'],
      [
        { code: 'ETIMEDOUT', command: 'DATA' },
        'UNCERTAIN',
        'SMTP_SUBMISSION_UNCERTAIN',
      ],
      [{ responseCode: 450 }, 'RETRYABLE', 'SMTP_REJECTED'],
      [{ responseCode: 550 }, 'PERMANENT', 'SMTP_REJECTED'],
    ] as const) {
      const { transport, provider } = setup()
      transport.sendMail.mockRejectedValue(error)
      await expect(provider.submit(message)).rejects.toMatchObject({
        disposition,
        safeCode: code,
      })
    }
  })
})
