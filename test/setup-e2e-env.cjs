/* global process: readonly */
// Set before AppModule import and configuration evaluation.
process.env.NODE_ENV = 'test'
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001'
// Required by OpenAPI contract/order E2E tests; production config is unchanged.
process.env.SWAGGER_ENABLED = 'true'
process.env.DATABASE_URL = ''
process.env.JWT_ACCESS_SECRET = ''

process.env.DIRECT_URL = ''
process.env.STRIPE_TEST_ENABLED = 'false'
process.env.STRIPE_TEST_CHECKOUT_ENABLED = 'false'
process.env.STRIPE_TEST_REFUNDS_ENABLED = 'false'
process.env.STRIPE_DEMO_MODE = 'false'
process.env.STRIPE_TEST_SECRET_KEY = ''
process.env.STRIPE_TEST_WEBHOOK_SECRET = ''
process.env.EMAIL_DELIVERY_MODE = 'disabled'
process.env.PUSH_DELIVERY_MODE = 'disabled'
process.env.JOBS_CRON_ENABLED = 'false'
