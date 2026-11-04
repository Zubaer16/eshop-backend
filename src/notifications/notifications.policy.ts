import { BadRequestException } from '@nestjs/common'

export const notificationRules = {
  'order.created': {
    kind: 'ORDER_PLACED',
    title: 'Order placed',
    body: 'Your order {orderId} has been placed.',
    target: 'ORDER',
    permission: 'orders.manage',
  },
  'order.cancelled': {
    kind: 'ORDER_CANCELLED',
    title: 'Order cancelled',
    body: 'Your order {orderId} was cancelled.',
    target: 'ORDER',
  },
  'order.expired': {
    kind: 'ORDER_EXPIRED',
    title: 'Order expired',
    body: 'The payment window for order {orderId} expired.',
    target: 'ORDER',
  },
  'payment.test_settled': {
    kind: 'PAYMENT_VERIFIED',
    title: 'Payment received',
    body: 'Payment for order {orderId} was verified.',
    target: 'ORDER',
  },
  'order.fulfillment.shipped': {
    kind: 'ORDER_SHIPPED',
    title: 'Order shipped',
    body: 'Your order {orderId} has shipped.',
    target: 'TRACKING',
  },
  'order.fulfillment.delivered': {
    kind: 'ORDER_DELIVERED',
    title: 'Order delivered',
    body: 'Your order {orderId} was delivered.',
    target: 'TRACKING',
  },
  'payment.test_refund_succeeded': {
    kind: 'REFUND_COMPLETED',
    title: 'Refund completed',
    body: 'A refund for order {orderId} has completed.',
    target: 'ORDER',
  },
  'payment.test_review_required': {
    kind: 'PAYMENT_REVIEW',
    title: 'Payment review required',
    body: 'Order {orderId} requires payment review.',
    target: 'ORDER',
    permission: 'payments.view',
  },
  'payment.test_refund_review_required': {
    kind: 'REFUND_REVIEW',
    title: 'Refund review required',
    body: 'Order {orderId} requires refund review.',
    target: 'ORDER',
    permission: 'payments.view',
  },
  'payment.test_refund_failed': {
    kind: 'REFUND_FAILED',
    title: 'Refund failed',
    body: 'A refund for order {orderId} failed. Review the refund ledger.',
    target: 'ORDER',
    permission: 'payments.view',
  },
  'inventory.low_stock': {
    kind: 'LOW_STOCK',
    title: 'Low stock',
    body: 'Product {productId} has reached its low-stock threshold.',
    target: 'PRODUCT',
    permission: 'inventory.adjust',
  },
  'auth.password_changed': {
    kind: 'SECURITY_PASSWORD_CHANGED',
    title: 'Password changed',
    body: 'Your password changed. Contact support if you did not make this change.',
    target: 'HOME',
  },
  'auth.password_reset.completed': {
    kind: 'SECURITY_PASSWORD_RESET',
    title: 'Password reset',
    body: 'Your password was reset. Contact support if you did not make this change.',
    target: 'HOME',
  },
} as const
export type NotificationEventType = keyof typeof notificationRules
export const notificationEventTypes = Object.keys(notificationRules)
export const preferenceDefaults = {
  revision: 0,
  transactionalEmail: true,
  transactionalPush: true,
  operationalInApp: true,
  operationalEmail: false,
  operationalPush: true,
  marketingInApp: false,
  marketingEmail: false,
  marketingPush: false,
  marketingConsentAt: null,
}
export function validateTemplate(value: string, max: number) {
  // eslint-disable-next-line no-control-regex -- Templates are bounded plain text, never HTML.
  if (!value.trim() || value.length > max || /[<>\x00-\x1f\x7f]/.test(value))
    throw new BadRequestException('Template must be bounded plain text')
  const remainder = value.replace(/\{(?:orderId|productId)\}/g, '')
  if (/[{}]/.test(remainder))
    throw new BadRequestException(
      'Only {orderId} and {productId} placeholders are supported',
    )
  return value.trim()
}
export function renderTemplate(
  value: string,
  variables: Record<string, string>,
  max: number,
) {
  return validateTemplate(value, max)
    .replace(
      /\{(orderId|productId)\}/g,
      (_, key: string) => variables[key] ?? '',
    )
    .slice(0, max)
}
export function parseDispatchOptions(args: string[]) {
  let since: Date | undefined
  let limit = 50
  let apply = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--apply') apply = true
    else if (arg === '--since') {
      const value = args[++i] ?? ''
      if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
        throw new Error('Explicit --since timezone required')
      since = new Date(value)
    } else if (arg === '--limit') limit = Number(args[++i])
    else throw new Error('Unknown notification dispatcher option')
  }
  if (
    !since ||
    !Number.isFinite(since.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200
  )
    throw new Error('Use --since ISO_TIMESTAMP --limit 1..200 [--apply]')
  return { since, limit, apply }
}
