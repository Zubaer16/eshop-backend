import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { encryptEmailActionToken } from '../auth/credentials/email-verification.crypto'
import { EmailContent } from './email-content'
import { recipientHash, validatedEmailTemplate } from './email.policy'
const userId = 'abf322c1-2c97-4ccb-8aa6-be261e855a69',
  eventId = 'c01c3241-e1d5-41db-a96a-7882ed971c43',
  key = 'b'.repeat(64),
  token = 'a'.repeat(64),
  expiresAt = new Date(Date.now() + 600000)
function setup() {
  const event = {
    id: eventId,
    eventType: 'auth.email_verification.requested',
    createdAt: new Date(),
    payload: {
      userId,
      eventId,
      recipientHash: recipientHash('user@example.test'),
      token: encryptEmailActionToken(key, token, userId + ':' + eventId),
      expiresAt: expiresAt.toISOString(),
    },
  }
  const user = {
    id: userId,
    email: 'user@example.test',
    status: 'ACTIVE',
    role: 'CUSTOMER',
    emailVerifiedAt: null,
  }
  const challenge = {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    consumedAt: null,
    expiresAt,
  }
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    emailVerificationChallenge: {
      findUnique: jest.fn().mockResolvedValue(challenge),
    },
  }
  const content = new EmailContent({
    get: () => key,
  } as unknown as ConfigService<Environment, true>)
  return { event, user, challenge, tx, content }
}
describe('email delivery one-time action content (execution release acceptance)', () => {
  it('requires current authenticated ciphertext, challenge digest, expiry and recipient identity', async () => {
    const s = setup()
    expect(
      await s.content.action(
        s.tx as unknown as Prisma.TransactionClient,
        s.event,
      ),
    ).toMatchObject({ token, kind: 'EMAIL_VERIFY' })
    s.user.email = 'different@example.test'
    await expect(
      s.content.action(s.tx as unknown as Prisma.TransactionClient, s.event),
    ).rejects.toThrow('RECIPIENT')
  })
  it('rejects superseded, consumed and unbound historical actions', async () => {
    for (const mutation of ['superseded', 'consumed', 'legacy']) {
      const s = setup()
      if (mutation === 'superseded') s.challenge.tokenHash = 'f'.repeat(64)
      if (mutation === 'consumed') s.challenge.consumedAt = new Date() as never
      if (mutation === 'legacy')
        delete (s.event.payload as Partial<typeof s.event.payload>)
          .recipientHash
      await expect(
        s.content.action(s.tx as unknown as Prisma.TransactionClient, s.event),
      ).rejects.toThrow()
    }
  })
  it('does not let editable templates inject action URLs, token values or markup', () => {
    for (const text of [
      '{token}',
      '{actionUrl}',
      '<script>',
      'bad\nheader',
      '{orderId}',
    ])
      expect(() =>
        validatedEmailTemplate('EMAIL_VERIFY', 'Verify email', text),
      ).toThrow()
    expect(
      validatedEmailTemplate(
        'EMAIL_VERIFY',
        'Verify email',
        'Use the secure link below.',
      ),
    ).toMatchObject({ subject: 'Verify email' })
  })
})
