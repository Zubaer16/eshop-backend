import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { AuthService } from '../auth.service'
import { DatabaseService } from '../../database/database.service'
import { Environment } from '../../config/environment'
import { ImmediateEmail } from '../../email/immediate-email.service'

describe('verification schedules delivery after durable issuance', () => {
  function setup() {
    let committed = false
    const tx = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          email: 'customer@example.test',
        }),
      },
      emailVerificationChallenge: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
      auditEvent: { create: jest.fn() },
    }
    const start = jest.fn(() => expect(committed).toBe(true))
    const auth = new AuthService(
      {
        client: {
          $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
            const result = await run(tx)
            committed = true
            return result
          },
        },
      } as unknown as DatabaseService,
      {} as JwtService,
      { get: () => 'ab'.repeat(32) } as unknown as ConfigService<
        Environment,
        true
      >,
      { start } as unknown as ImmediateEmail,
    )
    return { tx, start, auth }
  }

  it('kicks only the committed event and preserves the accepted response', async () => {
    const { tx, start, auth } = setup()
    await expect(auth.requestEmailVerification('customer')).resolves.toEqual({
      accepted: true,
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      tx.outboxEvent.create.mock.calls[0]![0].data.id,
    )
  })

  it('does not kick a new attempt during the resend cooldown', async () => {
    const { tx, start, auth } = setup()
    tx.emailVerificationChallenge.findUnique.mockResolvedValue({
      requestedAt: new Date(),
    })
    await auth.requestEmailVerification('customer')
    expect(start).not.toHaveBeenCalled()
    expect(tx.outboxEvent.create).not.toHaveBeenCalled()
  })

  it('does not submit an event when the issuing transaction fails', async () => {
    const { tx, start, auth } = setup()
    tx.auditEvent.create.mockRejectedValue(new Error('transaction failure'))
    await expect(auth.requestEmailVerification('customer')).rejects.toThrow(
      'transaction failure',
    )
    expect(start).not.toHaveBeenCalled()
  })
})
