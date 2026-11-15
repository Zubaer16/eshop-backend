import { ConfigService } from '@nestjs/config'
import { waitUntil } from '@vercel/functions'
import { Environment } from '../config/environment'
import { EmailQueue } from './email-queue.service'
import { EmailDispatcher } from './email-dispatcher.service'
import { ImmediateEmail } from './immediate-email.service'

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))

describe('request-scoped immediate email processing', () => {
  function setup(mode = 'controlled') {
    const queue = { queue: jest.fn().mockResolvedValue({ queued: 1 }) }
    const dispatcher = {
      dispatch: jest.fn().mockResolvedValue({ accepted: 1 }),
    }
    const service = new ImmediateEmail(
      { get: () => mode } as unknown as ConfigService<Environment, true>,
      queue as unknown as EmailQueue,
      dispatcher as unknown as EmailDispatcher,
    )
    return { service, queue, dispatcher }
  }

  beforeEach(() => jest.clearAllMocks())

  it('returns immediately and registers the exact event with the request lifecycle', async () => {
    const { service, queue, dispatcher } = setup()
    let release!: () => void
    queue.queue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    expect(service.start('new-event')).toBeUndefined()
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(queue.queue).toHaveBeenCalledWith(new Date(0), 1, true, 'new-event')
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
    release()
    await jest.mocked(waitUntil).mock.calls[0]![0]
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      new Date(0),
      1,
      true,
      'new-event',
    )
  })

  it('leaves a failed planning attempt recoverable without rejecting the accepted request', async () => {
    const { service, queue, dispatcher } = setup()
    queue.queue.mockRejectedValue(new Error('private provider detail'))
    service.start('failed-event')
    await expect(
      jest.mocked(waitUntil).mock.calls[0]![0],
    ).resolves.toBeUndefined()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('keeps disabled deployments free of provider work', () => {
    const { service, queue } = setup('disabled')
    service.start('disabled-event')
    expect(queue.queue).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })
})
