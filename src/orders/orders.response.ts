import { ApiProperty } from '@nestjs/swagger'
import {
  OrderResponseDto,
  OrderLineResponseDto,
  OrderShippingAddressDto,
} from './orders.dto'
import { OrderFulfillmentResponseDto } from './fulfillment/fulfillment.dto'

class OrderPageMetadataDto {
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class CustomerOrderPageDto extends OrderPageMetadataDto {
  @ApiProperty({ type: [OrderResponseDto] }) items!: OrderResponseDto[]
}
export class AdminOrderSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) customerId!: string
  @ApiProperty({ enum: ['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED'] })
  status!: string
  @ApiProperty() currency!: string
  @ApiProperty() totalMinor!: number
  @ApiProperty() discountMinor!: number
  @ApiProperty({ type: String, nullable: true }) couponCode!: string | null
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: OrderFulfillmentResponseDto, nullable: true })
  fulfillment!: OrderFulfillmentResponseDto | null
}
export class AdminOrderPageDto extends OrderPageMetadataDto {
  @ApiProperty({ type: [AdminOrderSummaryDto] }) items!: AdminOrderSummaryDto[]
}
export class AdminOrderDetailDto extends AdminOrderSummaryDto {
  @ApiProperty() countryCode!: string
  @ApiProperty() subtotalMinor!: number
  @ApiProperty() shippingMinor!: number
  @ApiProperty() taxMinor!: number
  @ApiProperty({ type: Object, nullable: true }) couponSnapshot!: Record<
    string,
    unknown
  > | null
  @ApiProperty({ enum: ['standard', 'express'], nullable: true })
  deliveryKind!: string | null
  @ApiProperty({ type: OrderShippingAddressDto })
  shippingAddress!: OrderShippingAddressDto
  @ApiProperty({ format: 'date-time' }) paymentDeadlineAt!: Date
  @ApiProperty({ type: [OrderLineResponseDto] }) lines!: OrderLineResponseDto[]
}
