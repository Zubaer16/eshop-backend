import type { NextFunction, Request, Response } from 'express'
import type { DatabaseService } from '../database/database.service'
import {
  anonymousAbuseKey,
  authAbuseLimiter,
  authAbusePolicy,
} from './auth-abuse-limiter.middleware'

describe('G11 credential abuse limiter (deferred execution to G12)', () => {
  it('only protects exact credential routes and never touches payment/webhook/worker routes', () => {
    expect(authAbusePolicy('POST', '/v1/auth/login')?.limit).toBe(15)
    expect(authAbusePolicy('POST', '/v1/AUTH/LOGIN/')?.limit).toBe(15)
    expect(authAbusePolicy('POST', '/v1/admin/auth/login')?.limit).toBe(10)
    expect(
      authAbusePolicy('POST', '/v1/auth/password-reset/request')?.limit,
    ).toBe(8)
    for (const [verb, path] of [
      ['GET', '/v1/auth/login'],
      ['POST', '/v1/auth/login/extra'],
      ['POST', '/v1/payments/webhooks/stripe'],
      ['GET', '/v1/internal/jobs/tick'],
      ['POST', '/v1/orders'],
    ])
      expect(authAbusePolicy(verb!, path!)).toBeNull()
  })

  it('HMACs client identity without persisting raw IP, secrets or route path', () => {
    const policy = authAbusePolicy('POST', '/v1/auth/login')!
    const key = anonymousAbuseKey(policy, '203.0.113.1', 'private-key-1')
    expect(key).toMatch(/^[a-f0-9]{64}$/)
    expect(key).not.toContain('203.0.113.1')
    expect(key).toBe(anonymousAbuseKey(policy, '203.0.113.1', 'private-key-1'))
    expect(key).not.toBe(
      anonymousAbuseKey(policy, '203.0.113.2', 'private-key-1'),
    )
    expect(key).not.toBe(
      anonymousAbuseKey(policy, '203.0.113.1', 'private-key-2'),
    )
  })

  it('fail-closes on database errors and returns generic 429 with retry-after', async () => {
    const result = jest.fn()
    const db = { client: { $queryRaw: result } } as unknown as DatabaseService
    const middleware = authAbuseLimiter(db, 'x'.repeat(40))
    const request = {
      method: 'POST',
      path: '/v1/auth/login',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request
    const headers: Record<string, string> = {}
    const response: {
      status: jest.Mock
      json: jest.Mock
      setHeader: jest.Mock
    } = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value
      }),
    }
    const next = jest.fn() as NextFunction
    result.mockResolvedValueOnce([{ attempts: 16, retryAfter: 65 }])
    await middleware(request, response as unknown as Response, next)
    expect(response.status).toHaveBeenCalledWith(429)
    expect(headers['Retry-After']).toBe('65')
    expect(next).not.toHaveBeenCalled()
    result.mockRejectedValueOnce(new Error('DB private details'))
    await middleware(request, response as unknown as Response, next)
    expect(response.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'DB private details',
    )
    result.mockResolvedValueOnce([{ attempts: 1, retryAfter: 300 }])
    await middleware(request, response as unknown as Response, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
