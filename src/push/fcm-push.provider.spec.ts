import { ConfigService } from '@nestjs/config'
import { generateKeyPairSync, verify } from 'node:crypto'
import { Environment } from '../config/environment'
import { FcmPushProvider } from './fcm-push.provider'
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }),
  userId = '312ef601-3359-4884-983b-a6f04bdc92fb'
const values: Record<string, unknown> = {
  PUSH_DELIVERY_MODE: 'controlled',
  PUSH_RECIPIENT_USER_IDS: userId,
  FCM_PROJECT_ID: 'kookaburra-demo',
  FCM_CLIENT_EMAIL: 'fixture@kookaburra-demo.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY: keys.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
}
const message = {
  deliveryId: 'delivery-id',
  userId,
  token: 'test-token-only-not-a-real-registration',
  title: 'Account update',
  body: 'Sign in to view your notification.',
  targetType: 'ORDER',
  link: 'https://store.example.test/account',
}
const provider = () =>
  new FcmPushProvider({
    get: (key: string) => values[key],
  } as unknown as ConfigService<Environment, true>)
describe('push messaging FCM HTTP v1 adapter (mocked fetch; execution release acceptance)', () => {
  afterEach(() => jest.restoreAllMocks())
  it('uses a valid scoped RS256 service assertion and caches only short-lived access credentials', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'test-oauth', expires_in: 3600 }),
        ),
      )
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              name: 'projects/kookaburra-demo/messages/test-id',
            }),
          ),
      )
    const p = provider()
    expect(await p.submit(message)).toEqual({
      messageId: 'projects/kookaburra-demo/messages/test-id',
    })
    await p.submit(message)
    expect(mock).toHaveBeenCalledTimes(3)
    const form = mock.mock.calls[0]![1]!.body as URLSearchParams,
      assertion = form.get('assertion')!,
      parts = assertion.split('.')
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        keys.publicKey,
        Buffer.from(parts[2]!, 'base64url'),
      ),
    ).toBe(true)
    expect(
      JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()),
    ).toMatchObject({
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      iss: values.FCM_CLIENT_EMAIL,
    })
    const body = JSON.parse(mock.mock.calls[1]![1]!.body as string)
    expect(body.message.data).toEqual({
      deliveryId: 'delivery-id',
      targetType: 'ORDER',
    })
    expect(JSON.stringify(body)).not.toContain(userId)
    expect(mock.mock.calls[1]![0]).toBe(
      'https://fcm.googleapis.com/v1/projects/kookaburra-demo/messages:send',
    )
  })
  it('supports the current explicit FID target without guessing registration identity', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'test-oauth', expires_in: 3600 }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'projects/kookaburra-demo/messages/fid-message',
          }),
        ),
      )
    await provider().submit({
      ...message,
      identifierKind: 'FID',
      token: 'c123456789012345678901',
    })
    const payload = JSON.parse(mock.mock.calls[1]![1]!.body as string)
    expect(payload.message.fid).toBe('c123456789012345678901')
    expect(payload.message).not.toHaveProperty('token')
  })
  it('invalidates only explicit registration/project errors and treats payload errors separately', async () => {
    for (const [code, disposition] of [
      ['UNREGISTERED', 'INVALID_TOKEN'],
      ['SENDER_ID_MISMATCH', 'INVALID_TOKEN'],
      ['INVALID_ARGUMENT', 'PERMANENT'],
    ] as const) {
      jest.restoreAllMocks()
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: 'test-oauth', expires_in: 3600 }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                details: [
                  {
                    '@type':
                      'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                    errorCode: code,
                  },
                ],
              },
            }),
            { status: 400 },
          ),
        )
      await expect(provider().submit(message)).rejects.toMatchObject({
        disposition,
      })
    }
  })
  it('keeps a post-submission network timeout uncertain and refuses offsite HTTP before any connection', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'test-oauth', expires_in: 3600 }),
        ),
      )
      .mockRejectedValueOnce(new Error('timeout'))
    await expect(provider().submit(message)).rejects.toMatchObject({
      disposition: 'UNCERTAIN',
      safeCode: 'FCM_SUBMISSION_UNCERTAIN',
    })
    mock.mockClear()
    await expect(
      provider().submit({ ...message, link: 'http://store.example.test' }),
    ).rejects.toMatchObject({ safeCode: 'PUSH_HTTPS_REQUIRED' })
    expect(mock).not.toHaveBeenCalled()
  })
})
