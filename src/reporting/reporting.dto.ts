import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { attemptStates, orderStates } from './reporting.policy'
export class ReportWindowQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Inclusive UTC day; supply with to, max 366 days',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string
  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Exclusive UTC day',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string
}
export class FinancialReportQueryDto extends ReportWindowQueryDto {
  @ApiPropertyOptional({
    example: 'USD',
    description: 'Omit to keep currencies in separate groups; no FX',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string
}
export class SeriesReportQueryDto extends ReportWindowQueryDto {
  @ApiProperty({
    description: 'One explicit currency; up to 366 zero-filled UTC days',
  })
  @Matches(/^[A-Z]{3}$/)
  currency!: string
}
export class ReportPagingDto extends ReportWindowQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
export class OrdersReportQueryDto extends ReportPagingDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string
  @ApiPropertyOptional({ enum: orderStates })
  @IsOptional()
  @IsIn(orderStates)
  status?: (typeof orderStates)[number]
}
export class PaymentsReportQueryDto extends ReportPagingDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string
  @ApiPropertyOptional({ enum: attemptStates })
  @IsOptional()
  @IsIn(attemptStates)
  status?: (typeof attemptStates)[number]
}
export class ProductPerformanceQueryDto extends ReportPagingDto {
  @ApiProperty({ description: 'One explicit currency is required' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string
}
export class CustomerPerformanceQueryDto extends ReportPagingDto {
  @ApiProperty() @Matches(/^[A-Z]{3}$/) currency!: string
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
}
export class InventoryReportQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DRAFT', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DRAFT', 'ARCHIVED'])
  status?: string
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: 'true' | 'false'
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string
}
export class ActivityQueryDto extends ReportPagingDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]*$/)
  targetType?: string
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}
export class ReportExportQueryDto extends FinancialReportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]*$/)
  targetType?: string
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: 'true' | 'false'
}
export class ReportWindowDto {
  @ApiProperty() from!: string
  @ApiProperty() to!: string
  @ApiProperty({ format: 'date-time' }) asOf!: string
  @ApiProperty() timeZone!: string
  @ApiProperty() paymentScope!: string
}
export class CurrencyCollectionDto {
  @ApiProperty() currency!: string
  @ApiProperty({
    description:
      'Exact integer minor units as decimal strings; never floating point',
  })
  paidMinor!: string
  @ApiProperty() refundedMinor!: string
  @ApiProperty() netCollectedMinor!: string
  @ApiProperty() paidOrderCount!: number
  @ApiProperty() refundCount!: number
  @ApiProperty() paidMerchandiseGrossMinor!: string
  @ApiProperty() paidDiscountMinor!: string
  @ApiProperty() paidShippingMinor!: string
  @ApiProperty() paidTaxMinor!: string
}
export class OrderStatusCountDto {
  @ApiProperty() status!: string
  @ApiProperty() count!: number
}
export class FinancialSummaryDto {
  @ApiProperty({ type: ReportWindowDto }) window!: ReportWindowDto
  @ApiProperty({ type: [CurrencyCollectionDto] })
  byCurrency!: CurrencyCollectionDto[]
  @ApiProperty({ type: [OrderStatusCountDto] })
  placedOrdersByCurrentStatus!: OrderStatusCountDto[]
}
export class DailyCollectionDto {
  @ApiProperty() date!: string
  @ApiProperty() currency!: string
  @ApiProperty() paidMinor!: string
  @ApiProperty() refundedMinor!: string
  @ApiProperty() netCollectedMinor!: string
  @ApiProperty() paidOrderCount!: number
  @ApiProperty() refundCount!: number
}
export class DailyCollectionsDto {
  @ApiProperty({ type: ReportWindowDto }) window!: ReportWindowDto
  @ApiProperty({ type: [DailyCollectionDto] }) items!: DailyCollectionDto[]
}
export class ReportOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() status!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty() currency!: string
  @ApiProperty() totalMinor!: number
  @ApiProperty() discountMinor!: number
  @ApiProperty({ type: String, nullable: true }) fulfillmentStatus!:
    | string
    | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  settledAt!: Date | null
  @ApiProperty({ type: Number, nullable: true }) settledMinor!: number | null
  @ApiProperty() lifetimeRefundedMinor!: string
}
export class ReportPaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty() attemptStatus!: string
  @ApiProperty() collectionState!: string
  @ApiProperty() currency!: string
  @ApiProperty() attemptedMinor!: number
  @ApiProperty({ type: Number, nullable: true }) settledMinor!: number | null
  @ApiProperty() lifetimeRefundedMinor!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  settledAt!: Date | null
}
export class ProductPerformanceDto {
  @ApiProperty() productId!: string
  @ApiProperty({ type: String, nullable: true }) variantId!: string | null
  @ApiProperty() titleSnapshot!: string
  @ApiProperty({ type: String, nullable: true }) skuSnapshot!: string | null
  @ApiProperty() currency!: string
  @ApiProperty() unitsSold!: string
  @ApiProperty() merchandiseGrossMinor!: string
  @ApiProperty() discountMinor!: string
  @ApiProperty() merchandiseNetMinor!: string
}
export class CustomerPerformanceDto {
  @ApiProperty() id!: string
  @ApiProperty() displayName!: string
  @ApiProperty() email!: string
  @ApiProperty() status!: string
  @ApiProperty({ format: 'date-time' }) joinedAt!: Date
  @ApiProperty() currency!: string
  @ApiProperty() placedOrderCount!: number
  @ApiProperty() paidOrderCount!: number
  @ApiProperty() paidMinor!: string
  @ApiProperty() refundedMinor!: string
  @ApiProperty() netCollectedMinor!: string
}
export class InventoryRowDto {
  @ApiProperty() balanceId!: string
  @ApiProperty() productId!: string
  @ApiProperty({ type: String, nullable: true }) variantId!: string | null
  @ApiProperty() title!: string
  @ApiProperty({ type: String, nullable: true }) sku!: string | null
  @ApiProperty() status!: string
  @ApiProperty() currency!: string
  @ApiProperty() unitRetailMinor!: number
  @ApiProperty() onHand!: number
  @ApiProperty() reserved!: number
  @ApiProperty() available!: number
  @ApiProperty() threshold!: number
  @ApiProperty() lowStock!: boolean
}
export class InventoryTotalsDto {
  @ApiProperty() currency!: string
  @ApiProperty() skuCount!: number
  @ApiProperty() lowStockCount!: number
  @ApiProperty() physicalOutOfStockCount!: number
  @ApiProperty() unavailableCount!: number
  @ApiProperty() onHandUnits!: string
  @ApiProperty() reservedUnits!: string
  @ApiProperty() availableUnits!: string
  @ApiProperty({
    description: 'Current catalog retail estimate, not cost/profit',
  })
  retailOnHandMinor!: string
}
export class ActivityRowDto {
  @ApiProperty() id!: string
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null
  @ApiProperty() action!: string
  @ApiProperty() targetType!: string
  @ApiProperty({ type: String, nullable: true }) targetId!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
}
export class ReportPageDto {
  @ApiProperty({ type: ReportWindowDto }) window!: ReportWindowDto
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class OrdersReportPageDto extends ReportPageDto {
  @ApiProperty({ type: [ReportOrderDto] }) items!: ReportOrderDto[]
}
export class PaymentsReportPageDto extends ReportPageDto {
  @ApiProperty({ type: [ReportPaymentDto] }) items!: ReportPaymentDto[]
}
export class ProductReportPageDto extends ReportPageDto {
  @ApiProperty({ type: [ProductPerformanceDto] })
  items!: ProductPerformanceDto[]
}
export class CustomerReportPageDto extends ReportPageDto {
  @ApiProperty({ type: [CustomerPerformanceDto] })
  items!: CustomerPerformanceDto[]
}
export class ActivityPageDto extends ReportPageDto {
  @ApiProperty({ type: [ActivityRowDto] }) items!: ActivityRowDto[]
}
export class InventoryReportPageDto {
  @ApiProperty({ format: 'date-time' }) asOf!: string
  @ApiProperty({ type: [InventoryRowDto] }) items!: InventoryRowDto[]
  @ApiProperty({ type: [InventoryTotalsDto] })
  totalsByCurrency!: InventoryTotalsDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class DashboardAccessDto {
  @ApiProperty() financial!: boolean
  @ApiProperty() orders!: boolean
  @ApiProperty() inventory!: boolean
  @ApiProperty() catalog!: boolean
  @ApiProperty() customers!: boolean
}
export class DashboardCountsDto {
  @ApiProperty() products!: number
  @ApiProperty() activeProducts!: number
  @ApiProperty() customers!: number
}
export class DashboardDto {
  @ApiProperty({ type: ReportWindowDto }) window!: ReportWindowDto
  @ApiProperty({ type: DashboardAccessDto }) available!: DashboardAccessDto
  @ApiProperty({ type: FinancialSummaryDto, nullable: true })
  financial!: FinancialSummaryDto | null
  @ApiProperty({ type: [ReportOrderDto], nullable: true }) recentOrders!:
    | ReportOrderDto[]
    | null
  @ApiProperty({ type: [InventoryTotalsDto], nullable: true }) inventory!:
    | InventoryTotalsDto[]
    | null
  @ApiProperty({ type: Number, nullable: true }) products!: number | null
  @ApiProperty({ type: Number, nullable: true }) activeProducts!: number | null
  @ApiProperty({ type: Number, nullable: true }) customers!: number | null
}
