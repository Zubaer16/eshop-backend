import { BadRequestException } from '@nestjs/common'
import {
  notificationEventTypes,
  parseDispatchOptions,
  preferenceDefaults,
  renderTemplate,
  validateTemplate,
} from './notifications.policy'
describe('notifications notification policy (execution release acceptance)', () => {
  it('accepts plain text with bounded canonical placeholders and rejects HTML/control/arbitrary fields', () => {
    expect(
      renderTemplate('Order {orderId}', { orderId: 'canonical-id' }, 160),
    ).toBe('Order canonical-id')
    for (const value of [
      '<script>alert(1)</script>',
      'bad\ntext',
      '{token}',
      '{email}',
      'x'.repeat(161),
      '   ',
    ])
      expect(() => validateTemplate(value, 160)).toThrow(BadRequestException)
  })
  it('requires explicit backfill boundary and opt-in apply with bounded batch', () => {
    expect(parseDispatchOptions(['--since', '2026-11-02T00:00:00Z'])).toEqual({
      since: new Date('2026-11-02T00:00:00Z'),
      limit: 50,
      apply: false,
    })
    expect(
      parseDispatchOptions([
        '--since',
        '2026-11-02T00:00:00Z',
        '--limit',
        '10',
        '--apply',
      ]).apply,
    ).toBe(true)
    for (const args of [
      [],
      ['--apply'],
      ['--since', '2026-11-02'],
      ['--since', '2026-11-02T00:00:00Z', '--limit', '201'],
      ['--since', '2026-11-02T00:00:00Z', '--unknown'],
    ])
      expect(() => parseDispatchOptions(args)).toThrow()
  })
  it('does not treat raw provider receipts or encrypted action tokens as inbox events', () => {
    expect(notificationEventTypes).toContain('payment.test_settled')
    for (const type of [
      'payment_intent.succeeded',
      'auth.email_verification.requested',
      'auth.password_reset.requested',
      'media.renditions',
    ])
      expect(notificationEventTypes).not.toContain(type)
    expect(preferenceDefaults).toMatchObject({
      marketingInApp: false,
      marketingEmail: false,
      marketingPush: false,
      marketingConsentAt: null,
    })
  })
})
