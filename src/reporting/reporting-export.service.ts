import { BadRequestException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { ReportingDataService } from './reporting-data.service'
import { ReportExportQueryDto } from './reporting.dto'
import {
  attemptStates,
  exportKinds,
  ExportKind,
  orderStates,
  reportCsv,
} from './reporting.policy'
const columns: Record<ExportKind, string[]> = {
  sales: [
    'date',
    'currency',
    'paidMinor',
    'refundedMinor',
    'netCollectedMinor',
    'paidOrderCount',
    'refundCount',
  ],
  orders: [
    'id',
    'status',
    'createdAt',
    'currency',
    'totalMinor',
    'discountMinor',
    'fulfillmentStatus',
    'settledAt',
    'settledMinor',
    'lifetimeRefundedMinor',
  ],
  payments: [
    'id',
    'orderId',
    'attemptStatus',
    'collectionState',
    'currency',
    'attemptedMinor',
    'settledMinor',
    'lifetimeRefundedMinor',
    'createdAt',
    'settledAt',
  ],
  products: [
    'productId',
    'variantId',
    'titleSnapshot',
    'skuSnapshot',
    'currency',
    'unitsSold',
    'merchandiseGrossMinor',
    'discountMinor',
    'merchandiseNetMinor',
  ],
  customers: [
    'id',
    'displayName',
    'email',
    'status',
    'joinedAt',
    'currency',
    'placedOrderCount',
    'paidOrderCount',
    'paidMinor',
    'refundedMinor',
    'netCollectedMinor',
  ],
  inventory: [
    'balanceId',
    'productId',
    'variantId',
    'title',
    'sku',
    'status',
    'currency',
    'unitRetailMinor',
    'onHand',
    'reserved',
    'available',
    'threshold',
    'lowStock',
  ],
  activity: ['id', 'actorId', 'action', 'targetType', 'targetId', 'createdAt'],
}
@Injectable()
export class ReportingExportService {
  constructor(
    private readonly data: ReportingDataService,
    private readonly db: DatabaseService,
  ) {}
  async export(kindText: string, q: ReportExportQueryDto, actorId: string) {
    if (!(exportKinds as readonly string[]).includes(kindText))
      throw new BadRequestException('Unknown export kind')
    const kind = kindText as ExportKind,
      allowed: Record<ExportKind, string[]> = {
        sales: ['from', 'to', 'currency'],
        orders: ['from', 'to', 'currency', 'status'],
        payments: ['from', 'to', 'currency', 'status'],
        products: ['from', 'to', 'currency', 'productId'],
        customers: ['from', 'to', 'currency', 'search'],
        inventory: ['currency', 'status', 'lowStock', 'productId'],
        activity: ['from', 'to', 'search', 'actorId', 'targetType'],
      }
    for (const [field, value] of Object.entries(q))
      if (value !== undefined && !allowed[kind].includes(field))
        throw new BadRequestException('Unsupported filter for this export kind')
    if (['sales', 'products', 'customers'].includes(kind) && !q.currency)
      throw new BadRequestException('Select one currency for this export')
    if (q.status) {
      const statuses =
        kind === 'orders'
          ? orderStates
          : kind === 'payments'
            ? attemptStates
            : ['ACTIVE', 'DRAFT', 'ARCHIVED']
      if (!(statuses as readonly string[]).includes(q.status))
        throw new BadRequestException('Invalid export status')
    }
    if (kind === 'activity' && q.search && q.search.length > 100)
      throw new BadRequestException(
        'Activity search is limited to 100 characters',
      )
    const cap = 1000,
      limit = cap + 1
    const result =
      kind === 'sales'
        ? await this.data.daily({
            from: q.from,
            to: q.to,
            currency: q.currency!,
          })
        : kind === 'orders'
          ? await this.data.orders(
              {
                ...q,
                status: q.status as (typeof orderStates)[number] | undefined,
              },
              limit,
            )
          : kind === 'payments'
            ? await this.data.payments(
                {
                  ...q,
                  status: q.status as
                    | (typeof attemptStates)[number]
                    | undefined,
                },
                limit,
              )
            : kind === 'products'
              ? await this.data.products({ ...q, currency: q.currency! }, limit)
              : kind === 'customers'
                ? await this.data.customers(
                    { ...q, currency: q.currency! },
                    limit,
                  )
                : kind === 'inventory'
                  ? await this.data.inventory(q, limit)
                  : await this.data.activity(q, limit)
    if (('total' in result && result.total > cap) || result.items.length > cap)
      throw new BadRequestException(
        'Export exceeds 1000 rows; narrow the filters',
      )
    const rows = result.items.map((row) =>
      columns[kind].map(
        (field) => (row as unknown as Record<string, unknown>)[field],
      ),
    )
    const body = reportCsv(columns[kind], rows)
    if (Buffer.byteLength(body) > 5 * 1024 * 1024)
      throw new BadRequestException('Export exceeds 5 MiB; narrow the filters')
    await this.db.client.auditEvent.create({
      data: {
        actorId,
        action: 'reports.export.prepared',
        targetType: 'report',
        targetId: kind,
        createdAt: new Date(),
      },
    })
    const stamp =
      'window' in result
        ? result.window.from + '_' + result.window.to
        : result.asOf.slice(0, 10)
    return {
      body,
      filename: 'kookaburra-' + kind + '-' + stamp + '.csv',
      rowCount: rows.length,
    }
  }
}
