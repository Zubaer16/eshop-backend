import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { EmailQueue } from './email-queue.service'
import { EmailDispatcher } from './email-dispatcher.service'
import { EmailProvider } from './email.provider'

describe('immediate delivery scopes existing workers to one durable event', () => {
  const config = {
    get: () => 'controlled',
  } as unknown as ConfigService<Environment, true>

  it('restricts queue candidates while preserving the ordinary unscoped scan', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const queue = new EmailQueue(
      { client: { outboxEvent: { findMany } } } as unknown as DatabaseService,
      config,
    )
    await queue.queue(new Date(0), 1, true, 'event-a')
    expect(findMany.mock.calls[0][0].where.id).toBe('event-a')
    await queue.queue(new Date(0))
    expect(findMany.mock.calls[1][0].where.id).toBeUndefined()
  })

  it('restricts expired leases and dispatch candidates to the same event', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const dispatcher = new EmailDispatcher(
      { client: { emailDelivery: { findMany } } } as unknown as DatabaseService,
      config,
      {} as EmailProvider,
    )
    await dispatcher.dispatch(new Date(0), 1, true, 'event-b')
    expect(findMany).toHaveBeenCalledTimes(2)
    for (const [query] of findMany.mock.calls)
      expect(query.where.eventId).toBe('event-b')
    await dispatcher.dispatch(new Date(0))
    expect(findMany.mock.calls[2][0].where.eventId).toBeUndefined()
    expect(findMany.mock.calls[3][0].where.eventId).toBeUndefined()
  })
})
