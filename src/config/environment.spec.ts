import path from 'node:path'
import { validateEnvironment } from './environment'

describe('environment configuration', () => {
  it('keeps Stripe test prep disabled by default; refuses live credentials', () => {
    expect(validateEnvironment({}).STRIPE_TEST_ENABLED).toBe(false)
    expect(validateEnvironment({}).STRIPE_TEST_CHECKOUT_ENABLED).toBe(false)
    expect(validateEnvironment({}).STRIPE_TEST_REFUNDS_ENABLED).toBe(false)
    expect(() =>
      validateEnvironment({ STRIPE_TEST_REFUNDS_ENABLED: 'true' }),
    ).toThrow('TEST refunds')
    expect(() =>
      validateEnvironment({ STRIPE_TEST_REFUNDS_ENABLED: 'yes' }),
    ).toThrow()
    expect(() =>
      validateEnvironment({
        STRIPE_TEST_REFUNDS_ENABLED: 'true',
        STRIPE_TEST_ENABLED: 'true',
        STRIPE_TEST_SECRET_KEY: 'sk_test_TESTONLY123456789012345',
        STRIPE_TEST_WEBHOOK_SECRET: 'whsec_TESTONLY123456789012345',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        DATABASE_URL: 'postgresql://example/db',
        JWT_ACCESS_SECRET: 'a'.repeat(40),
      }),
    ).toThrow('TEST refunds')
    expect(() =>
      validateEnvironment({ STRIPE_TEST_CHECKOUT_ENABLED: 'true' }),
    ).toThrow('TEST checkout')
    expect(() =>
      validateEnvironment({ STRIPE_TEST_CHECKOUT_ENABLED: 'yes' }),
    ).toThrow()
    expect(() =>
      validateEnvironment({
        STRIPE_TEST_CHECKOUT_ENABLED: 'true',
        STRIPE_TEST_ENABLED: 'true',
        STRIPE_TEST_SECRET_KEY: 'sk_test_TESTONLY123456789012345',
        STRIPE_TEST_WEBHOOK_SECRET: 'whsec_TESTONLY123456789012345',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        DATABASE_URL: 'postgresql://example/db',
        JWT_ACCESS_SECRET: 'a'.repeat(40),
      }),
    ).toThrow('TEST checkout')
    expect(() => validateEnvironment({ STRIPE_TEST_ENABLED: 'true' })).toThrow(
      'Stripe TEST',
    )
    expect(() =>
      validateEnvironment({ STRIPE_TEST_SECRET_KEY: 'sk_live_not_allowed123' }),
    ).toThrow()
    expect(() => validateEnvironment({ STRIPE_TEST_ENABLED: 'yes' })).toThrow()
    expect(
      validateEnvironment({
        STRIPE_TEST_ENABLED: 'true',
        STRIPE_TEST_SECRET_KEY: 'sk_test_TESTONLY123456789012345',
        STRIPE_TEST_WEBHOOK_SECRET: 'whsec_TESTONLY123456789012345',
      }).STRIPE_TEST_ENABLED,
    ).toBe(true)
  })
  it('requires explicit TEST-only showcase opt-in in production', () => {
    const prod = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://shop.example',
      DATABASE_URL: 'postgresql://example/db',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      STRIPE_TEST_ENABLED: 'true',
      STRIPE_TEST_CHECKOUT_ENABLED: 'true',
      STRIPE_TEST_REFUNDS_ENABLED: 'true',
      STRIPE_TEST_SECRET_KEY: 'sk_test_TESTONLY123456789012345',
      STRIPE_TEST_WEBHOOK_SECRET: 'whsec_TESTONLY123456789012345',
    }
    expect(() => validateEnvironment(prod)).toThrow('TEST checkout')
    expect(() =>
      validateEnvironment({ ...prod, STRIPE_DEMO_MODE: 'true' }),
    ).not.toThrow()
    expect(
      validateEnvironment({ ...prod, STRIPE_DEMO_MODE: 'true' }),
    ).toMatchObject({
      NODE_ENV: 'production',
      STRIPE_DEMO_MODE: true,
      STRIPE_TEST_CHECKOUT_ENABLED: true,
      STRIPE_TEST_REFUNDS_ENABLED: true,
    })
    expect(validateEnvironment({}).STRIPE_DEMO_MODE).toBe(false)
    for (const flag of ['yes', 1, '', 'TRUE']) {
      expect(() =>
        validateEnvironment({ ...prod, STRIPE_DEMO_MODE: flag }),
      ).toThrow('STRIPE_DEMO_MODE')
    }
    expect(() =>
      validateEnvironment({
        ...prod,
        STRIPE_DEMO_MODE: 'true',
        STRIPE_TEST_ENABLED: 'false',
      }),
    ).toThrow('showcase')
    expect(() =>
      validateEnvironment({
        ...prod,
        STRIPE_DEMO_MODE: 'true',
        STRIPE_TEST_SECRET_KEY: 'sk_live_12345678901234567890',
      }),
    ).toThrow('Only Stripe test secret keys')
    expect(() =>
      validateEnvironment({
        ...prod,
        STRIPE_DEMO_MODE: 'true',
        STRIPE_TEST_WEBHOOK_SECRET: '',
      }),
    ).toThrow('Stripe TEST mode requires')
  })
  it('validates the separate email action encryption key without exposing it', () => {
    expect(() =>
      validateEnvironment({ AUTH_ACTION_TOKEN_ENCRYPTION_KEY: 'wrong' }),
    ).toThrow('AUTH_ACTION_TOKEN_ENCRYPTION_KEY')
    expect(
      validateEnvironment({ AUTH_ACTION_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) })
        .AUTH_ACTION_TOKEN_ENCRYPTION_KEY,
    ).toBe('ab'.repeat(32))
    expect(validateEnvironment({}).AUTH_ACTION_TOKEN_ENCRYPTION_KEY).toBe('')
  })
  it('uses restrictive defaults for local dev', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      SWAGGER_ENABLED: true,
      CORS_ORIGINS: '',
      DATABASE_URL: '',
    })
  })
  it('requires explicit allowed origins and database secrets in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'CORS',
    )
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
      }),
    ).toThrow('JWT')
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
      }),
    ).toThrow('DATABASE')
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        DATABASE_URL: 'postgresql://local.example/db',
      }),
    ).not.toThrow()
  })
  it('rejects wildcard, paths and insecure production origins', () => {
    for (const origin of [
      '*',
      'https://shop.example.com/path',
      'http://shop.example.com',
    ]) {
      expect(() =>
        validateEnvironment({ NODE_ENV: 'production', CORS_ORIGINS: origin }),
      ).toThrow()
    }
  })
  it('validates optional S3/R2 configuration and avoids provider ambiguity', () => {
    const setup = {
      MEDIA_PROVIDER: 's3',
      MEDIA_S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      MEDIA_S3_BUCKET: 'sample-assets',
      MEDIA_S3_REGION: 'us-east-1',
      MEDIA_S3_ACCESS_KEY_ID: 'EXAMPLE12345',
      MEDIA_S3_SECRET_ACCESS_KEY: 'this-is-not-a-real-secret',
      MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
    }
    expect(validateEnvironment(setup).MEDIA_PROVIDER).toBe('s3')
    expect(() => validateEnvironment({ MEDIA_PROVIDER: 'untrusted' })).toThrow()
    expect(() => validateEnvironment({ MEDIA_PROVIDER: 's3' })).toThrow()
    expect(() =>
      validateEnvironment({
        ...setup,
        MEDIA_S3_ENDPOINT: 'http://127.0.0.1:9000',
      }),
    ).toThrow()
    expect(() =>
      validateEnvironment({
        ...setup,
        MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.test/path?redirect=x',
      }),
    ).toThrow()
    expect(validateEnvironment({}).MEDIA_PROVIDER).toBe('cloudinary')
  })
  it('validates persistent VPS disk settings and does not allow temporary insecure production URLs', () => {
    const good = {
      MEDIA_PROVIDER: 'disk',
      MEDIA_DISK_ROOT: path.resolve('media-volume'),
      MEDIA_DISK_API_BASE_URL: 'http://localhost:4000',
      MEDIA_DISK_PUBLIC_BASE_URL: 'http://localhost:4000',
      MEDIA_DISK_UPLOAD_SECRET: 'z'.repeat(40),
    }
    expect(validateEnvironment(good).MEDIA_PROVIDER).toBe('disk')
    expect(() => validateEnvironment({ MEDIA_PROVIDER: 'disk' })).toThrow()
    expect(() =>
      validateEnvironment({ ...good, MEDIA_DISK_ROOT: '../escape' }),
    ).toThrow()
    expect(() =>
      validateEnvironment({ ...good, MEDIA_DISK_UPLOAD_SECRET: 'short' }),
    ).toThrow()
    expect(() =>
      validateEnvironment({
        ...good,
        MEDIA_DISK_PUBLIC_BASE_URL: 'https://cdn.example/path',
      }),
    ).toThrow()
    const secure = {
      ...good,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://shop.example',
      DATABASE_URL: 'postgresql://example/db',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      MEDIA_DISK_API_BASE_URL: 'https://api.example',
      MEDIA_DISK_PUBLIC_BASE_URL: 'https://media.example',
    }
    expect(validateEnvironment(secure).MEDIA_PROVIDER).toBe('disk')
    expect(() =>
      validateEnvironment({
        ...secure,
        MEDIA_DISK_API_BASE_URL: 'http://api.example',
      }),
    ).toThrow()
  })
  it('validates optional Cloudflare purge credentials without requiring a CDN for local development', () => {
    expect(validateEnvironment({}).MEDIA_CDN_CF_ZONE_ID).toBe('')
    expect(() =>
      validateEnvironment({ MEDIA_CDN_CF_API_TOKEN: 'a'.repeat(40) }),
    ).toThrow('together')
    expect(() =>
      validateEnvironment({
        MEDIA_CDN_CF_ZONE_ID: 'invalid',
        MEDIA_CDN_CF_API_TOKEN: 'a'.repeat(40),
      }),
    ).toThrow('zone')
    expect(() =>
      validateEnvironment({
        MEDIA_CDN_CF_ZONE_ID: 'a'.repeat(32),
        MEDIA_CDN_CF_API_TOKEN: 'short',
      }),
    ).toThrow('token')
    expect(
      validateEnvironment({
        MEDIA_CDN_CF_ZONE_ID: 'a'.repeat(32),
        MEDIA_CDN_CF_API_TOKEN: 'x'.repeat(40),
      }).MEDIA_CDN_CF_ZONE_ID,
    ).toHaveLength(32)
  })
  it('rejects invalid ports and malformed docs flag', () => {
    expect(() => validateEnvironment({ PORT: '-4' })).toThrow()
    expect(() =>
      validateEnvironment({ SWAGGER_ENABLED: 'sometimes' }),
    ).toThrow()
  })
})

describe('release security proxy and credential limiter deployment safety (release acceptance suite)', () => {
  const production = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://store.example.test',
    DATABASE_URL: 'postgresql://example.test/commerce',
    JWT_ACCESS_SECRET: 'z'.repeat(48),
  }
  it('enforces production rate limiting and preserves disabled test/dev default', () => {
    expect(validateEnvironment(production).AUTH_ABUSE_LIMIT_ENABLED).toBe(true)
    expect(validateEnvironment({}).AUTH_ABUSE_LIMIT_ENABLED).toBe(false)
    expect(() =>
      validateEnvironment({ AUTH_ABUSE_LIMIT_ENABLED: 'true' }),
    ).toThrow('AUTH_ABUSE_LIMIT_ENABLED')
    expect(() =>
      validateEnvironment({ ...production, AUTH_ABUSE_LIMIT_ENABLED: 'false' }),
    ).toThrow('AUTH_ABUSE_LIMIT_ENABLED')
    expect(() =>
      validateEnvironment({ AUTH_ABUSE_LIMIT_ENABLED: 'wat' }),
    ).toThrow('AUTH_ABUSE_LIMIT_ENABLED')
  })
  it('rejects arbitrary proxy trust, hostnames and malformed CIDR', () => {
    expect(
      validateEnvironment({
        ...production,
        TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
      }).TRUSTED_PROXY_CIDRS,
    ).toEqual(['127.0.0.1/32', '::1/128'])
    for (const value of [
      '*',
      'true',
      '0.0.0.0/0,0.0.0.0/0',
      'example.org',
      '127.0.0.1/33',
      '::1/129',
      '127.0.0.1/3/4',
    ]) {
      expect(() =>
        validateEnvironment({ TRUSTED_PROXY_CIDRS: value }),
      ).toThrow()
    }
  })
})
