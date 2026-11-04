import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
} from 'class-validator'

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export class SaveMerchandisingDto {
  @ApiProperty({
    minimum: 0,
    maximum: 2147483646,
    description: '0 creates; updates require current positive revision',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number

  @ApiProperty({ enum: CONTENT_STATUSES })
  @IsIn(CONTENT_STATUSES)
  status!: ContentStatus

  @ApiProperty({
    minimum: 1,
    maximum: 99,
    description: 'Ascending; ties use canonical ID for deterministic ordering',
  })
  @IsInt()
  @Min(1)
  @Max(99)
  position!: number

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Inclusive ISO timestamp with timezone; null/omitted = unbounded',
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
      'Exclusive ISO timestamp with timezone; null/omitted = unbounded',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt?: string | null
}

export class SaveStoreBannerDto extends SaveMerchandisingDto {
  @ApiProperty({ minLength: 3, maxLength: 160 })
  @IsString()
  @MaxLength(160)
  // eslint-disable-next-line no-control-regex -- Plain public text excludes ASCII controls and HTML brackets.
  @Matches(/^[^<>\x00-\x1f\x7f]{3,160}(?![\s\S])/)
  headline!: string

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  // eslint-disable-next-line no-control-regex -- Plain public text permits line breaks only in UI rendering, not persisted controls.
  @Matches(/^[^<>\x00-\x1f\x7f]*(?![\s\S])/)
  subtitle!: string

  @ApiProperty({ minLength: 2, maxLength: 60 })
  @IsString()
  @MaxLength(60)
  // eslint-disable-next-line no-control-regex -- Public CTA text cannot contain markup or control characters.
  @Matches(/^[^<>\x00-\x1f\x7f]{2,60}(?![\s\S])/)
  ctaText!: string

  @ApiProperty({
    maxLength: 300,
    example: '/shop?tag=sale',
    description:
      'Validated same-site route; no absolute, protocol-relative, traversal or double-encoded URL',
  })
  @IsString()
  @MaxLength(300)
  ctaHref!: string

  @ApiProperty({ enum: ['hero', 'secondary', 'promo'] })
  @IsIn(['hero', 'secondary', 'promo'])
  slot!: 'hero' | 'secondary' | 'promo'

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Verified Media Library ID; no arbitrary image URL. Null = text-only.',
  })
  @IsOptional()
  @IsUUID()
  imageMediaId?: string | null

  @ApiProperty({
    maxLength: 250,
    description: 'Required nonblank when imageMediaId is set',
  })
  @IsString()
  @MaxLength(250)
  // eslint-disable-next-line no-control-regex -- Public alternative text must not contain HTML/control characters.
  @Matches(/^[^<>\x00-\x1f\x7f]*(?![\s\S])/)
  imageAlt!: string
}

export class SaveFeaturedCollectionDto extends SaveMerchandisingDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  // eslint-disable-next-line no-control-regex -- Public title is plain text.
  @Matches(/^[^<>\x00-\x1f\x7f]{3,120}(?![\s\S])/)
  title!: string

  @ApiProperty({
    maxLength: 120,
    description:
      'Canonical stable slug; no implicit rename derived from a changed title',
  })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  // eslint-disable-next-line no-control-regex -- Public description is plain text.
  @Matches(/^[^<>\x00-\x1f\x7f]*(?![\s\S])/)
  description!: string

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 50,
    description:
      'Unique canonical product UUIDs in display order; all must be ACTIVE at publication',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  productIds!: string[]
}

export class MerchandisingPageQueryDto {
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
  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: ContentStatus
}

export class MerchandisingRevisionQueryDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedRevision!: number
}

export class MerchandisingSlugParamDto {
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string
}

export class MerchandisingImageDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() url!: string
  @ApiProperty() alt!: string
  @ApiProperty() width!: number
  @ApiProperty() height!: number
  @ApiProperty() mimeType!: string
  @ApiPropertyOptional() srcSet?: string
  @ApiPropertyOptional() sizes?: string
}

export class PublicStoreBannerDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() headline!: string
  @ApiProperty() subtitle!: string
  @ApiProperty() ctaText!: string
  @ApiProperty() ctaHref!: string
  @ApiProperty({ enum: ['hero', 'secondary', 'promo'] }) slot!: string
  @ApiProperty() position!: number
  @ApiProperty({ type: MerchandisingImageDto, nullable: true })
  image!: MerchandisingImageDto | null
}

export class AdminStoreBannerDto extends PublicStoreBannerDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) imageMediaId!:
    | string
    | null
  @ApiProperty() imageAlt!: string
  @ApiProperty({ enum: CONTENT_STATUSES }) status!: string
  @ApiProperty() revision!: number
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt!: Date | null
}

export class MerchandisingProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() slug!: string
  @ApiProperty() title!: string
  @ApiProperty() priceMinor!: number
  @ApiProperty() currency!: string
  @ApiProperty({ type: Number, nullable: true }) compareAtMinor!: number | null
  @ApiProperty() badge!: string
  @ApiProperty({ type: String, nullable: true }) tag!: string | null
  @ApiProperty() hasVariants!: boolean
  @ApiProperty({ type: [String] }) categoryIds!: string[]
  @ApiProperty({
    minimum: 0,
    description:
      'Current availability hint only; reservation remains authoritative',
  })
  availableQuantity!: number
  @ApiProperty({ type: MerchandisingImageDto, nullable: true })
  image!: MerchandisingImageDto | null
}

export class PublicFeaturedCollectionDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() slug!: string
  @ApiProperty() title!: string
  @ApiProperty() description!: string
  @ApiProperty() position!: number
  @ApiProperty({
    type: [String],
    description: 'ACTIVE product IDs only, in curated order',
  })
  productIds!: string[]
  @ApiProperty() productCount!: number
  @ApiProperty({ type: [MerchandisingProductDto] })
  products!: MerchandisingProductDto[]
  @ApiProperty({
    description:
      'Homepage includes at most 8 cards; collection detail includes all, max 50',
  })
  productsTruncated!: boolean
}

export class AdminFeaturedCollectionDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() slug!: string
  @ApiProperty() title!: string
  @ApiProperty() description!: string
  @ApiProperty() position!: number
  @ApiProperty({ type: [String] }) productIds!: string[]
  @ApiProperty({ enum: CONTENT_STATUSES }) status!: string
  @ApiProperty() revision!: number
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt!: Date | null
}

class MerchandisingPageMetadataDto {
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class BannerPageResponseDto extends MerchandisingPageMetadataDto {
  @ApiProperty({ type: [AdminStoreBannerDto] }) items!: AdminStoreBannerDto[]
}
export class CollectionPageResponseDto extends MerchandisingPageMetadataDto {
  @ApiProperty({ type: [AdminFeaturedCollectionDto] })
  items!: AdminFeaturedCollectionDto[]
}
export class ArchivedMerchandisingDto {
  @ApiProperty({ enum: [true] }) archived!: true
  @ApiProperty() revision!: number
}
export class PublicHomepageDto {
  @ApiProperty() bannersTruncated!: boolean
  @ApiProperty() collectionsTruncated!: boolean
  @ApiProperty({ enum: [1] }) schemaVersion!: 1
  @ApiProperty({
    description:
      'Opaque fingerprint of the public projection, not an Admin edit revision',
  })
  revision!: string
  @ApiProperty({ type: [PublicStoreBannerDto] })
  banners!: PublicStoreBannerDto[]
  @ApiProperty({ type: [PublicFeaturedCollectionDto] })
  collections!: PublicFeaturedCollectionDto[]
}
