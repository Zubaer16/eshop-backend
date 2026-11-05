import { createHmac } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { DatabaseService } from '../database/database.service'

/**
 * G11: shared single-tenant PostgreSQL fixed-window abuse limiter. Only exact
 * unauthenticated / credential-action routes are included: no financial or
 * provider webhook route is intercepted. PostgreSQL's clock and atomic upsert
 * keep enforcement consistent across serverless/VPS replicas.
 *
 * IPs are never written to the database. Do not trust Forwarded/XFF headers:
 * Express req.ip is authoritative ONLY when the operator explicitly configures
 * a trusted reverse proxy in bootstrap.
 */
export type AbusePolicy = {
  readonly key: string
  readonly limit: number
  readonly windowSeconds: number
}

const byPath: Readonly<Record<string, AbusePolicy>> = {
  '/v1/auth/login': { key: 'customer-login', limit: 15, windowSeconds: 300 },
  '/v1/admin/auth/login': { key: 'staff-login', limit: 10, windowSeconds: 300 },
  '/v1/auth/register': { key: 'register', limit: 8, windowSeconds: 3600 },
  '/v1/auth/password-reset/request': {
    key: 'password-recovery-request',
    limit: 8,
    windowSeconds: 3600,
  },
  '/v1/auth/password-reset/confirm': {
    key: 'password-recovery-confirm',
    limit: 12,
    windowSeconds: 900,
  },
  '/v1/auth/email-verification/request': {
    key: 'email-verify-request',
    limit: 12,
    windowSeconds: 3600,
  },
  '/v1/auth/email-verification/confirm': {
    key: 'email-verify-confirm',
    limit: 16,
    windowSeconds: 900,
  },
  '/v1/auth/refresh': { key: 'refresh', limit: 40, windowSeconds: 300 },
}

export function authAbusePolicy(
  method: string,
  path: string,
): AbusePolicy | null {
  // Exact matching is intentional: excludes webhooks, job endpoints, all GETs,
  // and unknown routes. Query parameters never affect the policy.
  if (method !== 'POST') return null
  // Express routing is case-insensitive and accepts an optional trailing slash.
  // Match those aliases too, or clients could evade the throttle with /LOGIN/.
  const normalized = path.toLowerCase().replace(/\/+$/, '')
  return byPath[normalized] ?? null
}

export function anonymousAbuseKey(
  policy: AbusePolicy,
  ip: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update('kookaburra-g11-abuse-v1\0')
    .update(policy.key)
    .update('\0')
    .update(ip)
    .digest('hex')
}

export function authAbuseLimiter(database: DatabaseService, secret: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const policy = authAbusePolicy(req.method, req.path)
    if (!policy) {
      next()
      return
    }

    // Express resolves req.ip from the socket by default, never user-supplied
    // proxy headers. If explicitly configured, only approved proxy CIDRs count.
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown-client'
    const keyHash = anonymousAbuseKey(policy, ip, secret)
    const seconds = policy.windowSeconds
    let attempts: number
    let retryAfter: number
    try {
      const result = await database.client.$queryRaw<
        Array<{
          attempts: number
          retryAfter: number
        }>
      >`
        WITH incoming AS (
          SELECT ${keyHash}::varchar(64) AS key_hash,
            to_timestamp(
              floor(extract(epoch FROM statement_timestamp()) / ${seconds}) * ${seconds}
            ) AS window_start
        )
        INSERT INTO auth_abuse_buckets AS stored
          (key_hash, window_start, attempts, expires_at)
        SELECT key_hash, window_start, 1,
          window_start + (${seconds}::integer * interval '1 second')
        FROM incoming
        ON CONFLICT (key_hash) DO UPDATE
        SET attempts = CASE
              WHEN stored.window_start = EXCLUDED.window_start
              THEN LEAST(stored.attempts + 1, 1000000)
              ELSE 1
            END,
            window_start = EXCLUDED.window_start,
            expires_at = EXCLUDED.expires_at
        RETURNING stored.attempts AS attempts,
          GREATEST(1, CEIL(extract(epoch FROM
            (stored.expires_at - statement_timestamp()))))::integer AS "retryAfter"
      `
      if (result.length !== 1)
        throw new Error('Abuse limiter state unavailable')
      attempts = result[0]!.attempts
      retryAfter = result[0]!.retryAfter
    } catch {
      // Failing open on DB errors would re-enable credential stuffing exactly
      // during outages. Never expose database errors, account identifiers or IPs.
      res.setHeader('Cache-Control', 'no-store')
      res.status(503).json({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Authentication is temporarily unavailable.',
      })
      return
    }
    if (attempts > policy.limit) {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many attempts. Try again later.',
      })
      return
    }
    // Propagate any downstream handler errors to Express/Nest, never convert
    // unrelated application failures to misleading 503 throttle failures.
    next()
  }
}
