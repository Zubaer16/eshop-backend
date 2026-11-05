'use strict'
/** Secret-redacting, offline non-mutating deployment configuration preflight. */
const fs = require('node:fs')
const path = require('node:path')
const target = process.argv.find((v) => v.startsWith('--target='))?.slice(9)
if (!['vercel', 'vps'].includes(target)) {
  process.stderr.write(
    'Usage: node -r dotenv/config scripts/g11-release-preflight.cjs --target=vercel|vps\n',
  )
  process.exit(2)
}
const issues = []
const checks = []
const ok = (condition, description) => {
  if (condition) checks.push(description)
  else issues.push(description)
}
const env = process.env
const boolean = (name) => env[name] === 'true'
const originList = (env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const httpsOrigin = (v) => {
  try {
    const u = new URL(v)
    return (
      u.origin === v && u.protocol === 'https:' && !u.username && !u.password
    )
  } catch {
    return false
  }
}
const nodeMajor = Number(process.versions.node.split('.')[0])
ok(nodeMajor === 24, 'Node 24 is required')
ok(env.NODE_ENV === 'production', 'NODE_ENV=production is required')
ok(
  !!env.DATABASE_URL && /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL),
  'Runtime PostgreSQL URL required',
)
ok(
  (env.JWT_ACCESS_SECRET || '').length >= 32,
  'Strong per-installation JWT secret required',
)
ok(
  boolean('AUTH_ABUSE_LIMIT_ENABLED') ||
    env.AUTH_ABUSE_LIMIT_ENABLED === undefined,
  'Production abuse limiter must be on',
)
ok(
  !!originList.length &&
    originList.every(httpsOrigin) &&
    new Set(originList).size === originList.length,
  'Exact HTTPS CORS origins required',
)
ok(!boolean('SWAGGER_ENABLED'), 'Public production Swagger must be disabled')
ok(
  !env.STRIPE_TEST_SECRET_KEY ||
    env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_'),
  'Only Stripe TEST keys are permitted',
)
ok(
  !boolean('STRIPE_TEST_CHECKOUT_ENABLED') &&
    !boolean('STRIPE_TEST_REFUNDS_ENABLED'),
  'TEST checkout/refunds disabled in production',
)
ok(
  target !== 'vercel' || env.MEDIA_PROVIDER !== 'disk',
  'Vercel must not use ephemeral disk media',
)
ok(
  !boolean('JOBS_CRON_ENABLED') ||
    ((env.JOBS_CRON_SECRET || '').length >= 48 && !!env.JOBS_ALLOWED_LANES),
  'Enabled scheduler must have dedicated secret and allowlisted lanes',
)
const dotEnv = fs.existsSync(path.resolve('.env'))
if (dotEnv && process.env.G11_ACK_LOCAL_ENV_FILE !== 'true')
  issues.push(
    'Local .env present: do not deploy this file; pass secret config in platform environment',
  )
process.stdout.write(
  JSON.stringify(
    {
      target,
      result: issues.length ? 'BLOCKED' : 'OFFLINE_PREFLIGHT_OK',
      checks,
      issues,
    },
    null,
    2,
  ) + '\n',
)
if (issues.length) process.exitCode = 1
