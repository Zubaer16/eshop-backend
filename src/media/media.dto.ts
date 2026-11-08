import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsInt,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class StartMediaUploadDto {
  @ApiProperty({
    enum: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  })
  @IsString()
  @Matches(/^image\/(jpeg|png|webp|avif)$/)
  mimeType!: string
  @ApiProperty({ minimum: 1, maximum: 10485760 })
  @IsInt()
  @Min(1)
  @Max(10485760)
  bytes!: number
}
export class ProductMediaItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId!: string
  @ApiProperty({ minimum: 0, maximum: 5 })
  @IsInt()
  @Min(0)
  @Max(5)
  position!: number
  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  altText?: string
}
export class ReplaceProductGalleryDto {
  @ApiProperty({
    type: [ProductMediaItemDto],
    maxItems: 6,
    description: 'Atomic complete ordered gallery; [] detaches all',
  })
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique((x: ProductMediaItemDto) => x?.mediaId)
  @ValidateNested({ each: true })
  @Type(() => ProductMediaItemDto)
  items!: ProductMediaItemDto[]
}
export class MediaAssetPublicDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({
    enum: [
      'PENDING_UPLOAD',
      'ACTIVE',
      'PENDING_DELETE',
      'DELETED',
      'DELETE_FAILED',
    ],
  })
  status!: string
  @ApiProperty({ type: String, nullable: true }) url!: string | null
  @ApiProperty() mimeType!: string
  @ApiProperty() bytes!: number
  @ApiProperty() width!: number
  @ApiProperty() height!: number
}
export class MediaLibraryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
  @ApiPropertyOptional({
    enum: [
      'ACTIVE',
      'PENDING_UPLOAD',
      'PENDING_DELETE',
      'DELETE_FAILED',
      'DELETED',
    ],
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsIn([
    'ACTIVE',
    'PENDING_UPLOAD',
    'PENDING_DELETE',
    'DELETE_FAILED',
    'DELETED',
  ])
  status?:
    | 'ACTIVE'
    | 'PENDING_UPLOAD'
    | 'PENDING_DELETE'
    | 'DELETE_FAILED'
    | 'DELETED'
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exact canonical asset ID search; filenames are not stored',
  })
  @IsOptional()
  @IsUUID()
  id?: string
}
export class MediaLibraryPageDto {
  @ApiProperty({ type: [MediaAssetPublicDto] }) items!: MediaAssetPublicDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class MediaDeletionScheduledDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() scheduled!: boolean
}
export class MediaUploadInstructionDto {
  @ApiProperty({ format: 'uuid' }) mediaId!: string
  @ApiProperty({
    description:
      'Provider-specific direct upload URL. Cloudinary: multipart POST; S3/R2: signed PUT.',
  })
  uploadUrl!: string
  @ApiProperty({
    description: 'Signed form fields (never includes API secret)',
    type: Object,
  })
  fields!: Record<string, string | number | boolean>
  @ApiProperty({ enum: ['POST', 'PUT'] }) method!: 'POST' | 'PUT'
  @ApiProperty({ type: Object }) headers!: Record<string, string>
  @ApiProperty() expiresAt!: string
}
