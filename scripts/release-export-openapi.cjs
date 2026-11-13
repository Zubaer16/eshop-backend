'use strict'
/** Generates canonical /v1 OpenAPI from the same normalized bootstrap as the API.
 * Does not listen, load customer DB credentials or invoke providers. */
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const destination = path.join(root, 'artifacts', 'release', 'openapi.json')
if (!fs.existsSync(path.join(root, 'dist', 'bootstrap.js'))) {
  process.stderr.write(
    'Run npm run build before release acceptance OpenAPI export.\n',
  )
  process.exit(2)
}
const override = {
  NODE_ENV: 'test',
  PORT: '4105',
  SWAGGER_ENABLED: 'true',
  DATABASE_URL: '',
  DIRECT_URL: '',
  AUTH_ABUSE_LIMIT_ENABLED: 'false',
  TRUSTED_PROXY_CIDRS: '',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
  AUTH_ACTION_TOKEN_ENCRYPTION_KEY: '',
  PUSH_DELIVERY_MODE: 'disabled',
  EMAIL_DELIVERY_MODE: 'disabled',
  STRIPE_DEMO_MODE: 'false',
  STRIPE_TEST_ENABLED: 'false',
  STRIPE_TEST_CHECKOUT_ENABLED: 'false',
  STRIPE_TEST_REFUNDS_ENABLED: 'false',
  JOBS_CRON_ENABLED: 'false',
  JOBS_CRON_SECRET: '',
  JOBS_ALLOWED_LANES: '',
  MEDIA_PROVIDER: 'cloudinary',
  MEDIA_NAMESPACE: 'projects/kookaburra/products',
  MEDIA_CLOUD_NAME: '',
  MEDIA_API_KEY: '',
  MEDIA_API_SECRET: '',
  MEDIA_S3_ENDPOINT: '',
  MEDIA_S3_BUCKET: '',
  MEDIA_S3_REGION: '',
  MEDIA_S3_ACCESS_KEY_ID: '',
  MEDIA_S3_SECRET_ACCESS_KEY: '',
  MEDIA_S3_PUBLIC_BASE_URL: '',
  MEDIA_DISK_ROOT: '',
  MEDIA_DISK_API_BASE_URL: '',
  MEDIA_DISK_PUBLIC_BASE_URL: '',
  MEDIA_DISK_UPLOAD_SECRET: '',
  MEDIA_CDN_CF_ZONE_ID: '',
  MEDIA_CDN_CF_API_TOKEN: '',
  FCM_PROJECT_ID: '',
  FCM_CLIENT_EMAIL: '',
  FCM_PRIVATE_KEY: '',
  PUSH_TOKEN_ENCRYPTION_KEY: '',
  PUSH_RECIPIENT_USER_IDS: '',
  PUSH_STOREFRONT_ORIGIN: '',
  PUSH_ADMIN_ORIGIN: '',
  EMAIL_SMTP_HOST: '',
  EMAIL_SMTP_PORT: '465',
  EMAIL_FROM_ADDRESS: '',
  EMAIL_FROM_NAME: 'Store',
  EMAIL_REPLY_TO: '',
  EMAIL_PUBLIC_ORIGIN: '',
  EMAIL_ADMIN_ORIGIN: '',
  EMAIL_RECIPIENT_ALLOWLIST: '',
  EMAIL_SMTP_USER: '',
  EMAIL_SMTP_PASSWORD: '',
  STRIPE_TEST_SECRET_KEY: '',
  STRIPE_TEST_WEBHOOK_SECRET: '',
}
Object.assign(process.env, override)
const { createHttpApp } = require(path.join(root, 'dist', 'bootstrap.js'))
async function main() {
  let document
  let app
  try {
    app = await createHttpApp({
      onOpenApiDocument: (value) => {
        document = value
      },
    })
    if (!document) throw new Error('Swagger document was not captured')
    const { checkDocument } = require('./release-openapi-check.cjs')
    checkDocument(document)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, JSON.stringify(document, null, 2) + '\n', {
      mode: 0o600,
    })
    process.stdout.write(
      `Canonical /v1 OpenAPI exported: ${path.relative(root, destination)}\n`,
    )
  } finally {
    if (app) await app.close()
  }
}
main().catch(() => {
  // Avoid including connection/provider exception details in generated handoff logs.
  process.stderr.write(
    'release acceptance OpenAPI export failed. Check Nest bootstrap/static validation.\n',
  )
  process.exitCode = 1
})
