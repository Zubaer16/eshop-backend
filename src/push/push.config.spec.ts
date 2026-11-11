import { generateKeyPairSync } from 'node:crypto'
import { pushConfiguration } from './push.config'
import { parsePushCampaignOptions } from './push-options'
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString()
const configured = {
  PUSH_DELIVERY_MODE: 'controlled',
  FCM_PROJECT_ID: 'eshop-demo',
  FCM_CLIENT_EMAIL: 'fixture@eshop-demo.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY: privateKey,
  PUSH_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUSH_RECIPIENT_USER_IDS: '312ef601-3359-4884-983b-a6f04bdc92fb',
  PUSH_STOREFRONT_ORIGIN: 'https://store.example.test',
  PUSH_ADMIN_ORIGIN: 'https://admin.example.test',
}
describe('push messaging push deployment/campaign controls (execution release acceptance)', () => {
  it('defaults disabled and requires complete isolated controlled configuration', () => {
    expect(pushConfiguration({}, 'development').PUSH_DELIVERY_MODE).toBe(
      'disabled',
    )
    expect(pushConfiguration(configured, 'development').FCM_PROJECT_ID).toBe(
      'eshop-demo',
    )
    for (const patch of [
      { FCM_PRIVATE_KEY: '' },
      { PUSH_RECIPIENT_USER_IDS: '' },
      { PUSH_TOKEN_ENCRYPTION_KEY: 'weak' },
      { FCM_CLIENT_EMAIL: 'other@wrong.iam.gserviceaccount.com' },
      { PUSH_STOREFRONT_ORIGIN: 'http://evil.test' },
      { PUSH_ADMIN_ORIGIN: 'https://admin.example.test/redirect' },
      { PUSH_DELIVERY_MODE: 'production' },
    ])
      expect(() =>
        pushConfiguration({ ...configured, ...patch }, 'development'),
      ).toThrow()
  })
  it('uses global production delivery when controlled mode has no recipient allowlist', () => {
    const global = pushConfiguration(
      { ...configured, PUSH_RECIPIENT_USER_IDS: '' },
      'production',
    )
    expect(global.PUSH_DELIVERY_MODE).toBe('production')
    expect(global.PUSH_RECIPIENT_USER_IDS).toBe('')
    expect(() =>
      pushConfiguration(
        { ...configured, PUSH_RECIPIENT_USER_IDS: '' },
        'development',
      ),
    ).toThrow('Controlled push requires explicit user allowlist')
  })
  it('keeps campaign worker preview-only by default and rejects ignored date/unknown arguments', () => {
    expect(parsePushCampaignOptions([])).toEqual({ limit: 50, apply: false })
    expect(parsePushCampaignOptions(['--apply', '--limit', '2'])).toEqual({
      limit: 2,
      apply: true,
    })
    for (const args of [
      ['--since', '2026-11-02T00:00:00Z'],
      ['--limit', '201'],
      ['--limit', '0'],
    ])
      expect(() => parsePushCampaignOptions(args)).toThrow()
  })
})
