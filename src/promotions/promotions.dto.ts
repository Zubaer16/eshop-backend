import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

export const normalizeCouponCode = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

export class CouponSelectionDto {
  @ApiPropertyOptional({
    type: String,
    minLength: 3,
    maxLength: 24,
    description: 'One code only; normalized trim/uppercase. No stacking.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => normalizeCouponCode(value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,23}$/)
  couponCode?: string
}

export class RevisionDto {
  @ApiProperty({
    minimum: 0,
    maximum: 2147483646,
    description: '0 creates; updates require the current revision',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
}

export class PromotionRevisionQueryDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedRevision!: number
}

export class SaveCouponDto extends RevisionDto {
  @ApiProperty({ minLength: 3, maxLength: 24 })
  @Transform(({ value }: { value: unknown }) => normalizeCouponCode(value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,23}$/)
  code!: string

  @ApiProperty({ enum: ['PERCENT', 'FIXED'] })
  @IsIn(['PERCENT', 'FIXED'])
  kind!: 'PERCENT' | 'FIXED'

  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
    description:
      'PERCENT: basis points (1000 = 10%); FIXED: currency minor units',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  value!: number

  @ApiProperty({
    example: 'USD',
    description:
      'Required for both kinds; never convert currency automatically',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string

  @ApiProperty({
    minimum: 0,
    maximum: 2147483647,
    description: 'Minimum gross cart merchandise subtotal',
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  minimumSubtotalMinor!: number

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
    description: 'Null/omitted = no cap; Admin preview 0 must map to null',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maximumDiscountMinor?: number | null

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
    description:
      'Null/omitted = unlimited. Active holds and unpaid/paid orders consume capacity.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  usageLimit?: number | null

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  perCustomerLimit?: number | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Inclusive ISO timestamp with explicit timezone; null = unbounded',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Exclusive ISO timestamp with explicit timezone; null = unbounded',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description:
      'Null = all products; exact category membership only, no implicit descendants',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description:
      'Optional campaign gate; does not automatically apply a coupon',
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string | null

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean
}

export class SavePromotionCampaignDto extends RevisionDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  // eslint-disable-next-line no-control-regex -- Public plain text must reject ASCII controls.
  @Matches(/^[^<>\x00-\x1f]{3,120}$/)
  title!: string

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string

  @ApiProperty({
    maxLength: 2000,
    description:
      'Admin campaign notes; never included in the public campaign projection',
  })
  @IsString()
  @MaxLength(2000)
  // eslint-disable-next-line no-control-regex -- Public plain text must reject ASCII controls.
  @Matches(/^[^<>\x00-\x1f]*$/)
  description!: string

  @ApiProperty({ enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'] })
  @IsIn(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'])
  status!: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED'

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt?: string | null
}

export class PromotionPageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string
}

export class CouponResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() code!: string
  @ApiProperty({ enum: ['PERCENT', 'FIXED'] }) kind!: string
  @ApiProperty() value!: number
  @ApiProperty() currency!: string
  @ApiProperty() minimumSubtotalMinor!: number
  @ApiProperty({ type: Number, nullable: true }) maximumDiscountMinor!:
    | number
    | null
  @ApiProperty({ type: Number, nullable: true }) usageLimit!: number | null
  @ApiProperty({ type: Number, nullable: true }) perCustomerLimit!:
    | number
    | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) categoryId!:
    | string
    | null
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) campaignId!:
    | string
    | null
  @ApiProperty() enabled!: boolean
  @ApiProperty() revision!: number
}

export class PublicPromotionCampaignDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() title!: string
  @ApiProperty() slug!: string
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt!: Date | null
}

export class PromotionCampaignResponseDto extends PublicPromotionCampaignDto {
  @ApiProperty({ description: 'Admin-only campaign notes' })
  description!: string
  @ApiProperty({ enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'] })
  status!: string
  @ApiProperty() revision!: number
}

class PromotionPageMetadataDto {
  @ApiProperty({ minimum: 0 }) total!: number
  @ApiProperty({ minimum: 1 }) page!: number
  @ApiProperty({ minimum: 1, maximum: 50 }) limit!: number
  @ApiProperty({ minimum: 0 }) pages!: number
}

export class CouponPageResponseDto extends PromotionPageMetadataDto {
  @ApiProperty({ type: [CouponResponseDto] }) items!: CouponResponseDto[]
}

export class CampaignPageResponseDto extends PromotionPageMetadataDto {
  @ApiProperty({ type: [PromotionCampaignResponseDto] })
  items!: PromotionCampaignResponseDto[]
}

export class CouponUsageResponseDto {
  @ApiProperty({
    minimum: 0,
    description:
      'Unexpired holds and pending/paid orders; excludes no-op/failed checkout attempts',
  })
  activeClaims!: number
  @ApiProperty() note!: string
}

export class DisabledPromotionResponseDto {
  @ApiProperty({ enum: [true] }) disabled!: true
  @ApiProperty({ minimum: 2 }) revision!: number
  @ApiProperty({ enum: [true] }) historyPreserved!: true
}
