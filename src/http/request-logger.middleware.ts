import { Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const logger = new Logger('HTTP')
/** Avoid logging credentials, cookies, request bodies or potentially sensitive query strings. */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint()
  const requestId = randomUUID()
  res.setHeader('X-Request-Id', requestId)
  res.once('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000
    // Express matched route template, e.g. /v1/orders/:id, rather than
    // the actual URL: no UUIDs, reset fragments, paths or query PII in logs.
    // Unmatched routes are deliberately collapsed to one safe label.
    const template: unknown = req.route?.path
    const path =
      typeof template === 'string' && template.startsWith('/')
        ? template.slice(0, 160).replace(/[\r\n\t]/g, '')
        : '/unmatched'
    logger.log(
      `${req.method} ${path} -> ${res.statusCode} (${elapsedMs.toFixed(0)}ms) [${requestId.slice(0, 8)}]`,
    )
  })
  next()
}
