import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { NextFunction, Request, Response } from 'express'
import type { DatabaseService } from '../src/database/database.service'
import {
  anonymousAbuseKey,
  authAbuseLimiter,
  authAbusePolicy,
} from '../src/http/auth-abuse-limiter.middleware'
import { ReportingFixture } from './reporting-test-support'

test('G11 PostgreSQL: 20 concurrent credential requests share one atomic bucket, fail at 15, no raw IP stored (G12)', async ({
  request,
}) => {
  const fixture = new ReportingFixture(request)
  const ip = '192.0.2.211'
  const secret = randomBytes(48).toString('hex')
  const policy = authAbusePolicy('POST', '/v1/auth/login')!
  const digest = anonymousAbuseKey(policy, ip, secret)
  try {
    const middleware = authAbuseLimiter(
      { client: fixture.db } as unknown as DatabaseService,
      secret,
    )
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, async () => {
        let outcome = 200
        const req = {
          method: 'POST',
          path: '/v1/auth/login',
          ip,
          socket: { remoteAddress: ip },
          headers: { 'x-forwarded-for': '8.8.8.8' },
        } as unknown as Request
        let res: Response
        res = {
          setHeader: (_header: string, _value: string) => res,
          status: (code: number) => {
            outcome = code
            return res
          },
          json: (_body: unknown) => res,
        } as unknown as Response
        await middleware(req, res, (() => undefined) as NextFunction)
        return outcome
      }),
    )
    expect(outcomes.filter((code) => code === 200)).toHaveLength(15)
    expect(outcomes.filter((code) => code === 429)).toHaveLength(5)
    const saved = await fixture.db.authAbuseBucket.findUniqueOrThrow({
      where: { keyHash: digest },
    })
    expect(saved.attempts).toBe(20)
    expect(JSON.stringify(saved)).not.toContain(ip)
    expect(saved.keyHash).not.toBe(anonymousAbuseKey(policy, '8.8.8.8', secret))
  } finally {
    await fixture.db.authAbuseBucket.deleteMany({ where: { keyHash: digest } })
    await fixture.close()
  }
})
