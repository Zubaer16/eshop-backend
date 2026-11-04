import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export const DELIVERY_KINDS = ['standard', 'express'] as const
export type DeliveryKindInput = (typeof DELIVERY_KINDS)[number]

export class DeliveryZoneServiceInputDto {
  @ApiProperty({ enum: DELIVERY_KINDS })
  @IsIn(DELIVERY_KINDS)
  kind!: DeliveryKindInput

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  shippingMinor!: number

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: 2147483647,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  freeOverSubtotalMinor?: number | null

  @ApiProperty({
    maxLength: 100,
    description: 'Plain-text informational ETA, never an SLA',
  })
  @IsString()
  @MaxLength(100)
  // eslint-disable-next-line no-control-regex -- Intentionally reject ASCII control characters in public text.
  @Matches(/^[^<>\x00-\x1f]*$/)
  etaNote!: string

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean
}

export class SaveDeliveryZoneDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number

  @ApiProperty({ minLength: 3, maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 .&()'/-]{2,79}$/)
  name!: string

  @ApiProperty({
    example: 'USD',
    description: 'No cross-currency or FX fallback',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @ApiProperty({
    type: [String],
    example: ['US', 'CA'],
    description:
      'ISO 3166-1 alpha-2. A country belongs to at most one zone per currency.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true })
  countries!: string[]

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean

  @ApiProperty({
    type: [DeliveryZoneServiceInputDto],
    description: 'Exactly one standard and one express configuration',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneServiceInputDto)
  services!: DeliveryZoneServiceInputDto[]
}

export class DeleteDeliveryZoneQueryDto {
  @ApiProperty({ description: 'Expected current positive revision' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number
}

export class DeliveryZoneResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() name!: string
  @ApiProperty() currency!: string
  @ApiProperty() enabled!: boolean
  @ApiProperty({ minimum: 1 }) revision!: number
  @ApiProperty({ type: [String] }) countries!: string[]
  @ApiProperty({ type: [DeliveryZoneServiceInputDto] })
  services!: DeliveryZoneServiceInputDto[]
}

export class AvailableDeliveryOptionDto {
  @ApiPropertyOptional({
    enum: DELIVERY_KINDS,
    nullable: true,
    description: 'Null means existing flat-rate lane without a configured zone',
  })
  kind!: DeliveryKindInput | null
  @ApiProperty() label!: string
  @ApiProperty({ type: 'integer' }) shippingMinor!: number
  @ApiProperty({ type: 'integer' }) taxMinor!: number
  @ApiProperty({ type: 'integer' }) totalMinor!: number
  @ApiProperty({ type: String }) etaNote!: string
}
export class AvailableDeliveryOptionsDto {
  @ApiProperty({ type: 'integer' }) discountMinor!: number
  @ApiProperty({ type: String, nullable: true }) couponCode!: string | null
  @ApiProperty() countryCode!: string
  @ApiProperty() currency!: string
  @ApiProperty({ type: 'integer' }) subtotalMinor!: number
  @ApiProperty({ type: [AvailableDeliveryOptionDto] })
  options!: AvailableDeliveryOptionDto[]
  @ApiProperty({ enum: [false] }) guestCheckoutEnabled!: false
}
