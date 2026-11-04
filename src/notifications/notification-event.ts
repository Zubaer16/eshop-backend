import { Prisma } from '../generated/prisma/client'
import { defaultStaffRole } from '../auth/permissions'
import {
  NotificationEventType,
  notificationRules,
} from './notifications.policy'
export class NotificationEventError extends Error {}
type Tx = Prisma.TransactionClient
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function referenceId(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  if (typeof value !== 'string' || !uuid.test(value))
    throw new NotificationEventError('INVALID_EVENT_REFERENCE')
  return value
}
export async function activeNotificationStaff(
  tx: Tx,
  permission: string,
  channel: 'IN_APP' | 'EMAIL' | 'PUSH' = 'IN_APP',
) {
  const roles = await tx.staffRolePermission.findMany({
    where: { permissionKey: permission },
    select: { roleKey: true },
  })
  const granted = new Set(roles.map((role) => role.roleKey))
  const users = await tx.user.findMany({
    where: { status: 'ACTIVE', role: { not: 'CUSTOMER' } },
    include: {
      staffRoleAssignment: { select: { roleKey: true } },
      notificationPreference: {
        select: {
          operationalInApp: true,
          operationalEmail: true,
          operationalPush: true,
        },
      },
    },
    take: 1001,
    orderBy: { id: 'asc' },
  })
  // Do not silently truncate a large tenant. G10 can introduce paged durable fanout.
  if (users.length > 1000)
    throw new NotificationEventError('STAFF_FANOUT_LIMIT')
  return users
    .filter(
      (user) =>
        (channel === 'IN_APP'
          ? user.notificationPreference?.operationalInApp !== false
          : channel === 'EMAIL'
            ? user.notificationPreference?.operationalEmail === true
            : user.notificationPreference?.operationalPush !== false) &&
        (user.role === 'OWNER' ||
          (user.staffRoleAssignment?.roleKey !== 'OWNER' &&
            granted.has(
              user.staffRoleAssignment?.roleKey ??
                defaultStaffRole(user.role) ??
                '',
            ))),
    )
    .map((user) => user.id)
}

export async function resolveNotificationEvent(
  tx: Tx,
  event: {
    id: string
    eventType: string
    payload: Prisma.JsonValue
    createdAt: Date
  },
) {
  const type = event.eventType as NotificationEventType
  const rule = notificationRules[type]
  if (!rule) throw new NotificationEventError('UNSUPPORTED_EVENT')
  const payload =
    event.payload &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {}
  let targetType: string = rule.target
  let customerId: string | null = null,
    targetId: string | null = null
  const permission: string | null =
    'permission' in rule ? rule.permission : null
  const variables: Record<string, string> = {}
  if (type.startsWith('auth.')) {
    customerId = referenceId(payload, 'userId')
  } else if (type === 'inventory.low_stock') {
    const balance = await tx.inventoryBalance.findUnique({
      where: { id: referenceId(payload, 'balanceId') },
      include: {
        product: { select: { id: true, status: true, hasVariants: true } },
        variant: {
          select: { product: { select: { id: true, status: true } } },
        },
      },
    })
    const product = balance?.variant?.product ?? balance?.product
    // A recovered stock level or archived/hidden parent makes this stale event a safe no-op.
    if (
      !balance ||
      !product ||
      product.status !== 'ACTIVE' ||
      balance.onHand > balance.lowStockThreshold ||
      (balance.product?.hasVariants && !balance.variantId)
    )
      return null
    targetId = product.id
    variables.productId = product.id
  } else if (type === 'payment.test_review_required' && !payload.orderId) {
    // Some verified-receipt review events have no matched order. Keep them operational only.
    targetType = 'HOME'
    variables.orderId = 'unmatched payment'
  } else {
    const orderId = referenceId(payload, 'orderId')
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { paymentTransaction: true, shipment: true },
    })
    if (!order) throw new NotificationEventError('ORDER_NOT_FOUND')
    targetId = orderId
    customerId =
      type.includes('review_required') || type === 'payment.test_refund_failed'
        ? null
        : order.customerId
    variables.orderId = orderId
    if (
      type === 'payment.test_settled' &&
      (!order.paidAt ||
        !order.paymentTransaction ||
        order.paymentTransaction.id !==
          referenceId(payload, 'paymentTransactionId'))
    )
      throw new NotificationEventError('SETTLEMENT_NOT_VERIFIED')
    if (type === 'payment.test_refund_succeeded') {
      const refund = await tx.refundRequest.findUnique({
        where: { id: referenceId(payload, 'refundRequestId') },
      })
      if (
        !refund ||
        refund.orderId !== orderId ||
        refund.status !== 'SUCCEEDED' ||
        !refund.confirmedAt ||
        !refund.providerRefundId
      )
        throw new NotificationEventError('REFUND_NOT_VERIFIED')
    }
    if (type.startsWith('order.fulfillment.')) {
      if (
        !order.shipment ||
        order.shipment.id !== referenceId(payload, 'shipmentId') ||
        (type.endsWith('delivered')
          ? order.shipment.status !== 'DELIVERED'
          : !['SHIPPED', 'DELIVERED'].includes(order.shipment.status))
      )
        throw new NotificationEventError('SHIPMENT_NOT_VERIFIED')
    }
    if (type === 'order.cancelled' && order.status !== 'CANCELLED')
      throw new NotificationEventError('CANCELLATION_NOT_VERIFIED')
    if (type === 'order.expired' && order.status !== 'EXPIRED')
      throw new NotificationEventError('EXPIRY_NOT_VERIFIED')
  }
  return { type, rule, variables, targetType, targetId, customerId, permission }
}
