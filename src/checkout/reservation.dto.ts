import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CouponSelectionDto } from '../promotions/promotions.dto'
import { IsIn, IsOptional } from 'class-validator'
import { DELIVERY_KINDS, type DeliveryKindInput } from './delivery-zones.dto'
import { IsString, IsUUID, Matches } from 'class-validator'

export class CreateReservationDto extends CouponSelectionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Client-generated UUID; retries return the original hold and never double-reserve',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({ example: 'US' })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string

  @ApiPropertyOptional({
    enum: DELIVERY_KINDS,
    description:
      'Required when selecting express; default standard for configured zones',
  })
  @IsOptional()
  @IsIn(DELIVERY_KINDS)
  deliveryKind?: DeliveryKindInput
}

export class CheckoutReservationLineDto {
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty({ format: 'uuid', nullable: true }) variantId!: string | null
  @ApiProperty({ type: 'integer' }) quantity!: number
  @ApiProperty({ type: 'integer' }) unitPriceMinor!: number
  @ApiProperty({ type: 'integer' }) discountMinor!: number
}

export class CheckoutReservationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) cartId!: string
  @ApiProperty({ format: 'uuid' }) requestId!: string
  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'RELEASED', 'CONSUMED'] })
  status!: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONSUMED'
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date
  @ApiProperty({ example: 'US' }) countryCode!: string
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({ type: 'integer' }) discountMinor!: number
  @ApiProperty({ type: String, nullable: true }) couponCode!: string | null
  @ApiProperty({ type: Object, nullable: true }) couponSnapshot!: Record<
    string,
    unknown
  > | null
  @ApiProperty({ type: 'integer' }) subtotalMinor!: number
  @ApiProperty({ type: 'integer' }) shippingMinor!: number
  @ApiPropertyOptional({ enum: DELIVERY_KINDS, nullable: true })
  deliveryKind!: DeliveryKindInput | null
  @ApiProperty({ type: 'integer' }) taxMinor!: number
  @ApiProperty({ type: 'integer' }) estimatedTotalMinor!: number
  @ApiProperty({ type: [CheckoutReservationLineDto] })
  items!: CheckoutReservationLineDto[]
  @ApiProperty({
    example: false,
    description:
      'No order/payment exists; reserved stock is not a payable checkout',
  })
  payable!: false
}
