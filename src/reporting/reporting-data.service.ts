import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import type { SafeUser } from '../auth/auth.types'
import {
  FinancialReportQueryDto,
  SeriesReportQueryDto,
  OrdersReportQueryDto,
  PaymentsReportQueryDto,
  ProductPerformanceQueryDto,
  CustomerPerformanceQueryDto,
  InventoryReportQueryDto,
  ActivityQueryDto,
  ReportWindowQueryDto,
  CurrencyCollectionDto,
  DailyCollectionDto,
  ReportOrderDto,
  ReportPaymentDto,
  ProductPerformanceDto,
  CustomerPerformanceDto,
  InventoryRowDto,
  InventoryTotalsDto,
  ActivityRowDto,
} from './reporting.dto'
import {
  literalSearch,
  orderStates,
  reportWindow,
  ReportWindow,
  windowDto,
} from './reporting.policy'
type Tx = Prisma.TransactionClient
const currencyFilter = (field: Prisma.Sql, currency?: string) =>
  currency ? Prisma.sql`AND ${field}=${currency}` : Prisma.empty
const pageResult = <T>(
  items: T[],
  total: number,
  q: { page?: number; limit?: number },
  w: ReportWindow,
) => {
  const page = q.page ?? 1,
    limit = q.limit ?? 25
  return {
    window: windowDto(w),
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
}
@Injectable()
export class ReportingDataService {
  constructor(private readonly db: DatabaseService) {}
  async snapshot<T>(
    q: ReportWindowQueryDto,
    run: (tx: Tx, w: ReportWindow) => Promise<T>,
  ) {
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`
          await tx.$executeRaw`SET LOCAL statement_timeout='10000'`
          const clock = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`
          return run(tx, reportWindow(q, clock[0]!.now))
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 25000,
          maxWait: 5000,
        },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2028' ||
          (error.code === 'P2010' && String(error.meta?.code) === '57014'))
      )
        throw new ServiceUnavailableException(
          'Report query time exceeded; narrow the range and retry',
        )
      throw error
    }
  }
  private async financialIn(tx: Tx, w: ReportWindow, q: { currency?: string }) {
    const byCurrency = await tx.$queryRaw<
      CurrencyCollectionDto[]
    >`WITH paid AS (
   SELECT t.currency,count(*)::int AS count,sum(t.amount_minor)::text AS amount,sum(o.subtotal_minor)::text AS gross,sum(o.discount_minor)::text AS discount,sum(o.shipping_minor)::text AS shipping,sum(o.tax_minor)::text AS tax
   FROM payment_transactions t JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' JOIN orders o ON o.id=t.order_id
   WHERE t.created_at>=${w.start} AND t.created_at<${w.end} ${currencyFilter(Prisma.sql`t.currency`, q.currency)} GROUP BY t.currency
  ), refunded AS (
   SELECT r.currency,count(*)::int AS count,sum(r.amount_minor)::text AS amount FROM refund_requests r JOIN payment_transactions t ON t.id=r.payment_transaction_id AND t.order_id=r.order_id AND t.currency=r.currency JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST'
   WHERE r.status='SUCCEEDED' AND r.confirmed_at>=${w.start} AND r.confirmed_at<${w.end} AND r.provider_refund_id IS NOT NULL ${currencyFilter(Prisma.sql`r.currency`, q.currency)} GROUP BY r.currency
  ) SELECT coalesce(p.currency,r.currency) AS currency,coalesce(p.amount,'0') AS "paidMinor",coalesce(r.amount,'0') AS "refundedMinor",(coalesce(p.amount,'0')::numeric-coalesce(r.amount,'0')::numeric)::text AS "netCollectedMinor",coalesce(p.count,0) AS "paidOrderCount",coalesce(r.count,0) AS "refundCount",coalesce(p.gross,'0') AS "paidMerchandiseGrossMinor",coalesce(p.discount,'0') AS "paidDiscountMinor",coalesce(p.shipping,'0') AS "paidShippingMinor",coalesce(p.tax,'0') AS "paidTaxMinor" FROM paid p FULL JOIN refunded r ON r.currency=p.currency ORDER BY currency LIMIT 101`
    if (byCurrency.length > 100)
      throw new BadRequestException('Select one currency for this report')
    const counts = await tx.$queryRaw<
      { status: string; count: number }[]
    >`SELECT status::text AS status,count(*)::int AS count FROM orders WHERE created_at>=${w.start} AND created_at<${w.end} ${currencyFilter(Prisma.sql`currency`, q.currency)} GROUP BY status`
    return {
      window: windowDto(w),
      byCurrency,
      placedOrdersByCurrentStatus: orderStates.map((status) => ({
        status,
        count: counts.find((row) => row.status === status)?.count ?? 0,
      })),
    }
  }
  financial(q: FinancialReportQueryDto) {
    return this.snapshot(q, (tx, w) => this.financialIn(tx, w, q))
  }
  async daily(q: SeriesReportQueryDto) {
    return this.snapshot(q, async (tx, w) => {
      const items = await tx.$queryRaw<DailyCollectionDto[]>`WITH events AS (
   SELECT date_trunc('day',t.created_at) AS day,t.amount_minor::bigint AS paid,0::bigint AS refund,1 AS pc,0 AS rc FROM payment_transactions t JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' WHERE t.created_at>=${w.start} AND t.created_at<${w.end} AND t.currency=${q.currency}
   UNION ALL SELECT date_trunc('day',r.confirmed_at),0::bigint,r.amount_minor::bigint,0,1 FROM refund_requests r JOIN payment_transactions t ON t.id=r.payment_transaction_id AND t.order_id=r.order_id AND t.currency=r.currency JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' WHERE r.status='SUCCEEDED' AND r.provider_refund_id IS NOT NULL AND r.confirmed_at>=${w.start} AND r.confirmed_at<${w.end} AND r.currency=${q.currency}
  ), totals AS(SELECT day,sum(paid) AS paid,sum(refund) AS refund,sum(pc)::int AS pc,sum(rc)::int AS rc FROM events GROUP BY day)
  SELECT to_char(d.day,'YYYY-MM-DD') AS date,${q.currency}::text AS currency,coalesce(t.paid,0)::text AS "paidMinor",coalesce(t.refund,0)::text AS "refundedMinor",(coalesce(t.paid,0)-coalesce(t.refund,0))::text AS "netCollectedMinor",coalesce(t.pc,0) AS "paidOrderCount",coalesce(t.rc,0) AS "refundCount" FROM generate_series(${w.start}::timestamp,${w.end}::timestamp-interval '1 day',interval '1 day') d(day) LEFT JOIN totals t ON t.day=d.day ORDER BY d.day`
      return { window: windowDto(w), items }
    })
  }
  private async ordersIn(
    tx: Tx,
    w: ReportWindow,
    q: OrdersReportQueryDto,
    exportLimit?: number,
  ) {
    const filter = Prisma.sql`o.created_at>=${w.start} AND o.created_at<${w.end} ${currencyFilter(Prisma.sql`o.currency`, q.currency)} ${q.status ? Prisma.sql`AND o.status::text=${q.status}` : Prisma.empty}`
    const total = (
      await tx.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM orders o WHERE ${filter}`
    )[0]!.count
    const items = await tx.$queryRaw<
      ReportOrderDto[]
    >`SELECT o.id,o.status::text AS status,o.created_at AS "createdAt",o.currency,o.total_minor AS "totalMinor",o.discount_minor AS "discountMinor",s.status::text AS "fulfillmentStatus",t.created_at AS "settledAt",t.amount_minor AS "settledMinor",coalesce(r.amount,0)::text AS "lifetimeRefundedMinor" FROM orders o LEFT JOIN payment_transactions t ON t.order_id=o.id LEFT JOIN order_shipments s ON s.order_id=o.id LEFT JOIN LATERAL(SELECT sum(amount_minor) AS amount FROM refund_requests WHERE order_id=o.id AND payment_transaction_id=t.id AND currency=o.currency AND status='SUCCEEDED' AND confirmed_at IS NOT NULL AND provider_refund_id IS NOT NULL)r ON true WHERE ${filter} ORDER BY o.created_at DESC,o.id DESC LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)}`
    return pageResult(items, total, q, w)
  }
  orders(q: OrdersReportQueryDto, exportLimit?: number) {
    return this.snapshot(q, (tx, w) => this.ordersIn(tx, w, q, exportLimit))
  }
  payments(q: PaymentsReportQueryDto, exportLimit?: number) {
    return this.snapshot(q, async (tx, w) => {
      const filter = Prisma.sql`a.provider='STRIPE_TEST' AND a.created_at>=${w.start} AND a.created_at<${w.end} ${currencyFilter(Prisma.sql`a.currency`, q.currency)} ${q.status ? Prisma.sql`AND a.status::text=${q.status}` : Prisma.empty}`
      const total = (
        await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM payment_attempts a WHERE ${filter}`
      )[0]!.count
      const items = await tx.$queryRaw<
        ReportPaymentDto[]
      >`SELECT a.id,a.order_id AS "orderId",a.status::text AS "attemptStatus",CASE WHEN t.id IS NULL THEN 'UNSETTLED' WHEN coalesce(r.amount,0)>=t.amount_minor THEN 'REFUNDED' WHEN coalesce(r.amount,0)>0 THEN 'PARTIALLY_REFUNDED' ELSE 'PAID' END AS "collectionState",a.currency,a.amount_minor AS "attemptedMinor",t.amount_minor AS "settledMinor",coalesce(r.amount,0)::text AS "lifetimeRefundedMinor",a.created_at AS "createdAt",t.created_at AS "settledAt" FROM payment_attempts a LEFT JOIN payment_transactions t ON t.payment_attempt_id=a.id LEFT JOIN LATERAL(SELECT sum(amount_minor) AS amount FROM refund_requests WHERE payment_transaction_id=t.id AND currency=a.currency AND status='SUCCEEDED' AND confirmed_at IS NOT NULL AND provider_refund_id IS NOT NULL)r ON true WHERE ${filter} ORDER BY a.created_at DESC,a.id DESC LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)}`
      return pageResult(items, total, q, w)
    })
  }
  products(q: ProductPerformanceQueryDto, exportLimit?: number) {
    return this.snapshot(q, async (tx, w) => {
      const base = Prisma.sql`SELECT l.product_id AS "productId",l.variant_id AS "variantId",(array_agg(l.title_snapshot ORDER BY t.created_at DESC,l.id DESC))[1] AS "titleSnapshot",(array_agg(l.sku_snapshot ORDER BY t.created_at DESC,l.id DESC))[1] AS "skuSnapshot",t.currency,sum(l.quantity)::text AS "unitsSold",sum(l.line_total_minor)::text AS "merchandiseGrossMinor",sum(l.discount_minor)::text AS "discountMinor",sum(l.line_total_minor::bigint-l.discount_minor)::text AS "merchandiseNetMinor" FROM payment_transactions t JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' JOIN order_lines l ON l.order_id=t.order_id WHERE t.created_at>=${w.start} AND t.created_at<${w.end} AND t.currency=${q.currency} ${q.productId ? Prisma.sql`AND l.product_id=${q.productId}::uuid` : Prisma.empty} GROUP BY l.product_id,l.variant_id,t.currency`
      const total = (
        await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM(${base})x`
      )[0]!.count
      const items = await tx.$queryRaw<
        ProductPerformanceDto[]
      >`SELECT * FROM(${base})x ORDER BY "merchandiseNetMinor"::numeric DESC,"productId","variantId" NULLS FIRST LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)}`
      return pageResult(items, total, q, w)
    })
  }
  customers(q: CustomerPerformanceQueryDto, exportLimit?: number) {
    return this.snapshot(q, async (tx, w) => {
      const filter = Prisma.sql`u.role='CUSTOMER' ${q.search ? Prisma.sql`AND(u.display_name ILIKE ${literalSearch(q.search)} OR u.email ILIKE ${literalSearch(q.search)})` : Prisma.empty}`
      const total = (
        await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM users u WHERE ${filter}`
      )[0]!.count
      const items = await tx.$queryRaw<
        CustomerPerformanceDto[]
      >`WITH selected AS(SELECT u.id,u.display_name,u.email,u.status,u.created_at FROM users u WHERE ${filter} ORDER BY u.created_at DESC,u.id DESC LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)})
  SELECT u.id,u.display_name AS "displayName",u.email,u.status::text AS status,u.created_at AS "joinedAt",${q.currency}::text AS currency,coalesce(o.count,0) AS "placedOrderCount",coalesce(p.count,0) AS "paidOrderCount",coalesce(p.amount,0)::text AS "paidMinor",coalesce(r.amount,0)::text AS "refundedMinor",(coalesce(p.amount,0)-coalesce(r.amount,0))::text AS "netCollectedMinor" FROM selected u
  LEFT JOIN LATERAL(SELECT count(*)::int AS count FROM orders WHERE customer_id=u.id AND created_at>=${w.start} AND created_at<${w.end} AND currency=${q.currency})o ON true
  LEFT JOIN LATERAL(SELECT count(*)::int AS count,sum(t.amount_minor) AS amount FROM payment_transactions t JOIN orders ord ON ord.id=t.order_id JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' WHERE ord.customer_id=u.id AND t.created_at>=${w.start} AND t.created_at<${w.end} AND t.currency=${q.currency})p ON true
  LEFT JOIN LATERAL(SELECT sum(rr.amount_minor) AS amount FROM refund_requests rr JOIN orders ord ON ord.id=rr.order_id JOIN payment_transactions t ON t.id=rr.payment_transaction_id AND t.order_id=rr.order_id AND t.currency=rr.currency JOIN payment_attempts a ON a.id=t.payment_attempt_id AND a.provider='STRIPE_TEST' WHERE ord.customer_id=u.id AND rr.status='SUCCEEDED' AND rr.provider_refund_id IS NOT NULL AND rr.confirmed_at>=${w.start} AND rr.confirmed_at<${w.end} AND rr.currency=${q.currency})r ON true ORDER BY u.created_at DESC,u.id DESC`
      return pageResult(items, total, q, w)
    })
  }
  private async inventoryIn(
    tx: Tx,
    w: ReportWindow,
    q: InventoryReportQueryDto,
    exportLimit?: number,
  ) {
    const base = Prisma.sql`SELECT b.id AS "balanceId",p.id AS "productId",v.id AS "variantId",p.title,coalesce(v.sku,p.sku) AS sku,p.status::text AS status,p.currency,coalesce(v.price_minor,p.price_minor) AS "unitRetailMinor",b.on_hand AS "onHand",b.reserved_quantity AS reserved,(b.on_hand-b.reserved_quantity) AS available,b.low_stock_threshold AS threshold,(b.on_hand<=b.low_stock_threshold) AS "lowStock" FROM inventory_balances b LEFT JOIN product_variants v ON v.id=b.variant_id JOIN products p ON p.id=coalesce(b.product_id,v.product_id) WHERE(v.id IS NOT NULL OR p.has_variants=false) ${currencyFilter(Prisma.sql`p.currency`, q.currency)} ${q.productId ? Prisma.sql`AND p.id=${q.productId}::uuid` : Prisma.empty} ${q.status ? Prisma.sql`AND p.status::text=${q.status}` : Prisma.empty} ${q.lowStock ? Prisma.sql`AND (b.on_hand<=b.low_stock_threshold)=${q.lowStock === 'true'}` : Prisma.empty}`
    const total = (
      await tx.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM(${base})x`
    )[0]!.count
    const items = await tx.$queryRaw<
      InventoryRowDto[]
    >`SELECT * FROM(${base})x ORDER BY "productId","variantId" NULLS FIRST,"balanceId" LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)}`
    const totalsByCurrency = await tx.$queryRaw<
      InventoryTotalsDto[]
    >`SELECT currency,count(*)::int AS "skuCount",count(*)FILTER(WHERE "lowStock")::int AS "lowStockCount",count(*)FILTER(WHERE "onHand"=0)::int AS "physicalOutOfStockCount",count(*)FILTER(WHERE available=0)::int AS "unavailableCount",coalesce(sum("onHand"),0)::text AS "onHandUnits",coalesce(sum(reserved),0)::text AS "reservedUnits",coalesce(sum(available),0)::text AS "availableUnits",coalesce(sum("onHand"::bigint*"unitRetailMinor"::bigint),0)::text AS "retailOnHandMinor" FROM(${base})x GROUP BY currency ORDER BY currency LIMIT 101`
    if (totalsByCurrency.length > 100)
      throw new BadRequestException('Select one inventory currency')
    const { page, limit, pages } = pageResult(items, total, q, w)
    return { asOf: w.asOf, items, totalsByCurrency, total, page, limit, pages }
  }
  inventory(q: InventoryReportQueryDto, exportLimit?: number) {
    return this.snapshot({}, (tx, w) => this.inventoryIn(tx, w, q, exportLimit))
  }
  activity(q: ActivityQueryDto, exportLimit?: number) {
    return this.snapshot(q, async (tx, w) => {
      const filter = Prisma.sql`created_at>=${w.start} AND created_at<${w.end} ${q.actorId ? Prisma.sql`AND actor_id=${q.actorId}::uuid` : Prisma.empty} ${q.targetType ? Prisma.sql`AND target_type=${q.targetType}` : Prisma.empty} ${q.search ? Prisma.sql`AND(action ILIKE ${literalSearch(q.search)} OR target_type ILIKE ${literalSearch(q.search)} OR target_id ILIKE ${literalSearch(q.search)})` : Prisma.empty}`
      const total = (
        await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM audit_events WHERE ${filter}`
      )[0]!.count
      const items = await tx.$queryRaw<
        ActivityRowDto[]
      >`SELECT id,actor_id AS "actorId",action,target_type AS "targetType",target_id AS "targetId",created_at AS "createdAt" FROM audit_events WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT ${exportLimit ?? q.limit ?? 25} OFFSET ${exportLimit ? 0 : ((q.page ?? 1) - 1) * (q.limit ?? 25)}`
      return pageResult(items, total, q, w)
    })
  }
  dashboard(actor: SafeUser, q: FinancialReportQueryDto) {
    return this.snapshot(q, async (tx, w) => {
      const has = (key: string) =>
        actor.role === 'OWNER' ||
        actor.permissions?.some((p) => p === key) === true
      const available = {
        financial: has('payments.view'),
        orders: has('orders.manage'),
        inventory: has('inventory.adjust'),
        catalog: has('catalog.manage'),
        customers: has('customers.view'),
      }
      const financial = available.financial
          ? await this.financialIn(tx, w, q)
          : null,
        recentOrders = available.orders
          ? (await this.ordersIn(tx, w, { ...q, limit: 5 })).items
          : null,
        inventory = available.inventory
          ? (await this.inventoryIn(tx, w, { currency: q.currency, limit: 1 }))
              .totalsByCurrency
          : null
      const products = available.catalog ? await tx.product.count() : null,
        activeProducts = available.catalog
          ? await tx.product.count({ where: { status: 'ACTIVE' } })
          : null,
        customers = available.customers
          ? await tx.user.count({ where: { role: 'CUSTOMER' } })
          : null
      return {
        window: windowDto(w),
        available,
        financial,
        recentOrders,
        inventory,
        products,
        activeProducts,
        customers,
      }
    })
  }
}
