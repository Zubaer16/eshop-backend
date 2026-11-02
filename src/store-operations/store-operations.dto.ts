import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// Presentation settings cannot change trusted cart currency, authorization,
// CORS, the payment provider, or canonical order UUIDs.
export class PutStoreOperationsDto {
  @ApiProperty({
    minimum: 0,
    description: '0 creates settings; a later write must use current revision',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number

  @ApiProperty({ example: 'en-US', maxLength: 16 })
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/)
  @MaxLength(16)
  locale!: string

  @ApiProperty({
    example: 'USD',
    description: 'Display only; NO exchange-rate calculation',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  displayCurrency!: string

  @ApiProperty({
    example: 'KB',
    description:
      'Future human-readable reference policy; current order IDs remain UUIDs',
  })
  @IsString()
  @Matches(/^[A-Z0-9]{2,8}$/)
  orderPrefix!: string

  @ApiProperty({
    enum: ['light', 'dark', 'system'],
    description: 'Storefront appearance preference only',
  })
  @IsIn(['light', 'dark', 'system'])
  themeMode!: 'light' | 'dark' | 'system'

  @ApiProperty({
    example: '#1F2937',
    description: 'Strict CSS hex color only; never raw CSS',
  })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor!: string

  @ApiProperty({
    example: 'https://shop.example.com',
    description: 'Bare HTTPS origin or empty; NOT a live CORS allowlist change',
  })
  @IsString()
  @MaxLength(200)
  storefrontOrigin!: string

  @ApiProperty({
    example: 'https://admin.example.com',
    description: 'Bare HTTPS origin or empty; NOT a live CORS allowlist change',
  })
  @IsString()
  @MaxLength(200)
  adminOrigin!: string

  @ApiProperty({
    description:
      'Storefront presentation toggle only; authenticated API stays permission-checked',
  })
  @IsBoolean()
  showWishlist!: boolean

  @ApiProperty({
    description:
      'Storefront presentation toggle; published policy data remains readable',
  })
  @IsBoolean()
  showPolicies!: boolean
}

export class PublicStoreOperationsDto {
  @ApiProperty() configured!: boolean
  @ApiProperty() locale!: string
  @ApiProperty() displayCurrency!: string
  @ApiProperty({ enum: ['light', 'dark', 'system'] }) themeMode!:
    | 'light'
    | 'dark'
    | 'system'
  @ApiProperty() accentColor!: string
  @ApiProperty() showWishlist!: boolean
  @ApiProperty() showPolicies!: boolean
  @ApiProperty({
    enum: [false],
    description: 'v1 requires customer JWT before estimate/reserve/order',
  })
  guestCheckoutEnabled!: false
  @ApiProperty({
    enum: [true],
    description: 'Guest cart exists, but is not guest checkout',
  })
  guestCartEnabled!: true
}

export class AdminStoreOperationsDto extends PublicStoreOperationsDto {
  @ApiProperty() orderPrefix!: string
  @ApiProperty() storefrontOrigin!: string
  @ApiProperty() adminOrigin!: string
  @ApiProperty({ minimum: 0 }) revision!: number
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  updatedAt!: string | null
  @ApiProperty({
    description:
      'CORS_ORIGINS from deployment env, read only. Editing origins here does not grant access.',
  })
  deploymentCorsOrigins!: string[]
}
