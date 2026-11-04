import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import {
  notificationEventTypes,
  notificationRules,
} from '../notifications/notifications.policy'
export const emailEventTypes = [
  ...notificationEventTypes,
  'auth.email_verification.requested',
  'auth.password_reset.requested',
]
export const recipientHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
export const actionKinds = ['EMAIL_VERIFY', 'PASSWORD_RESET']
export const emailDefaults = [
  {
    key: 'EMAIL_VERIFY',
    subject: 'Verify your email',
    text: 'Please verify your email using the one-time link below.',
    target: 'HOME',
  },
  {
    key: 'PASSWORD_RESET',
    subject: 'Reset your password',
    text: 'A password reset was requested. Use the one-time link below if you made this request; otherwise ignore this email.',
    target: 'HOME',
  },
  ...Object.values(notificationRules).map((rule) => ({
    key: rule.kind,
    subject: rule.title,
    text: rule.body,
    target: rule.target,
  })),
]
export class EmailPolicySkip extends Error {}
export function emailText(input: string, max: number) {
  // eslint-disable-next-line no-control-regex -- Stored email templates are bounded plain text without header/HTML injection.
  if (!input.trim() || input.length > max || /[<>\x00-\x1f\x7f]/.test(input))
    throw new BadRequestException('Email templates must be bounded plain text')
  if (/[{}]/.test(input.replace(/\{(?:orderId|productId)\}/g, '')))
    throw new BadRequestException('Unsupported email placeholder')
  return input.trim()
}
export function validatedEmailTemplate(
  key: string,
  subject: string,
  text: string,
) {
  const fallback = emailDefaults.find((item) => item.key === key)
  if (!fallback) throw new BadRequestException('Unknown email template key')
  const clean = {
    subject: emailText(subject, 160),
    text: emailText(text, 1800),
  }
  const allowed =
    fallback.target === 'PRODUCT'
      ? 'productId'
      : fallback.target === 'HOME'
        ? ''
        : 'orderId'
  if (
    [
      ...clean.subject.matchAll(/\{(\w+)\}/g),
      ...clean.text.matchAll(/\{(\w+)\}/g),
    ].some((match) => match[1] !== allowed)
  )
    throw new BadRequestException('Placeholder unavailable for this email kind')
  return clean
}
