import { BadRequestException } from '@nestjs/common'
export const orderStates = [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'EXPIRED',
] as const
export const attemptStates = [
  'CREATING',
  'READY',
  'REQUIRES_REVIEW',
  'SETTLED',
  'CANCELLING',
  'CANCELLED',
  'CONFIRMING',
  'CAPTURING',
  'AWAITING_WEBHOOK',
] as const
export const exportKinds = [
  'sales',
  'orders',
  'payments',
  'products',
  'customers',
  'inventory',
  'activity',
] as const
export type ExportKind = (typeof exportKinds)[number]
export const reportPermissions = {
  sales: ['payments.view'],
  orders: ['orders.manage'],
  payments: ['payments.view'],
  products: ['payments.view', 'catalog.manage'],
  customers: ['payments.view', 'customers.view'],
  inventory: ['inventory.adjust'],
  activity: ['activity.view'],
} as const
export function reportWindow(
  input: { from?: string; to?: string },
  clock: Date,
) {
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1970)
      throw new BadRequestException('Use UTC YYYY-MM-DD dates from 1970 onward')
    const result = new Date(value + 'T00:00:00.000Z')
    if (
      !Number.isFinite(result.getTime()) ||
      result.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Invalid report day')
    return result
  }
  if (!!input.from !== !!input.to)
    throw new BadRequestException(
      'Provide both inclusive from and exclusive to',
    )
  const today = new Date(clock.toISOString().slice(0, 10) + 'T00:00:00.000Z'),
    to = input.to ? date(input.to) : new Date(today.getTime() + 86400000),
    from = input.from
      ? date(input.from)
      : new Date(to.getTime() - 30 * 86400000)
  const days = (to.getTime() - from.getTime()) / 86400000
  if (days < 1 || days > 366)
    throw new BadRequestException(
      'Report range must be 1–366 UTC days; to is exclusive',
    )
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    asOf: clock.toISOString(),
    timeZone: 'UTC' as const,
    paymentScope: 'STRIPE_TEST' as const,
    days,
    start: from,
    end: to,
  }
}
export type ReportWindow = ReturnType<typeof reportWindow>
export const windowDto = ({
  from,
  to,
  asOf,
  timeZone,
  paymentScope,
}: ReportWindow) => ({ from, to, asOf, timeZone, paymentScope })
// eslint-disable-next-line no-control-regex -- CSV leading controls must be treated as untrusted spreadsheet text.
export function csvCell(value: unknown) {
  let text =
    value == null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value)
  const trimmed = text.trimStart()
  if (
    !/^-?\d+$/.test(text) &&
    (/^[=+@＝＋－＠-]/.test(trimmed) || /^[\t\r\n\x00]/.test(text))
  )
    text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}
export function reportCsv(headers: string[], rows: unknown[][]) {
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  )
}
export function literalSearch(value: string) {
  // eslint-disable-next-line no-control-regex -- Search terms cannot pass PostgreSQL-invalid control bytes.
  if (/[\x00-\x1f\x7f]/.test(value))
    throw new BadRequestException('Search must be plain text')
  return '%' + value.replace(/[\\%_]/g, (char) => '\\' + char) + '%'
}
