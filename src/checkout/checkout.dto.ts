import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CheckoutItemsDto } from './checkout-items.dto'
import { DELIVERY_KINDS, type DeliveryKindInput } from './delivery-zones.dto'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator'

const MONEY_MAX = 2_147_483_647

/** Country code is an ISO 3166-1 alpha-2 identifier; validate supported lanes via owner configuration. */
export class CheckoutEstimateDto extends CheckoutItemsDto {
  @ApiProperty({ example: 'US', minLength: 2, maxLength: 2 })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string

  @ApiPropertyOptional({
    enum: DELIVERY_KINDS,
    description:
      'Standard by default for configured zones; omit for legacy flat rate',
  })
  @IsOptional()
  @IsIn(DELIVERY_KINDS)
  deliveryKind?: DeliveryKindInput
}

export class PutCheckoutRateDto {
  @ApiProperty({ example: 'US' })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: MONEY_MAX,
    description:
      'Flat shipping charge in currency minor units, BEFORE free-shipping threshold.',
  })
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  shippingMinor!: number

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: MONEY_MAX,
    description:
      'If subtotal >= threshold, shipping becomes zero. Omit or null to disable.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  freeOverSubtotalMinor?: number | null

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 10000,
    description:
      'Configured estimate rate in basis points, applied to merchandise subtotal only (tax-exclusive).',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  taxBps!: number

  @ApiProperty({
    type: 'boolean',
    description: 'Disabled lane blocks checkout estimate.',
  })
  @IsBoolean()
  enabled!: boolean
}

export class CheckoutRateResponseDto extends PutCheckoutRateDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date
}

export class CheckoutEstimateResponseDto {
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
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryZoneName!:
    | string
    | null
  @ApiProperty({ type: String }) deliveryEtaNote!: string
  @ApiProperty({ type: 'integer' }) taxMinor!: number
  @ApiProperty({ type: 'integer' }) estimatedTotalMinor!: number
  @ApiProperty({ type: 'integer' }) appliedTaxBps!: number
  @ApiProperty({ type: String, format: 'date-time' }) quotedAt!: string
  @ApiProperty({ enum: ['NOT_RESERVED'] }) reservationStatus!: 'NOT_RESERVED'
  @ApiProperty({
    example: false,
    description:
      'Only a reservation/order in a later phase can confirm checkout and payment.',
  })
  payable!: false
  @ApiProperty({
    description:
      'Estimate is live and can change. Country-only rates are not a substitute for local jurisdiction tax compliance.',
  })
  notice!: string
}
