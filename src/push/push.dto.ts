import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
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
  MinLength,
} from 'class-validator'
import { MerchandisingImageDto } from '../merchandising/merchandising.dto'
export class PushRevisionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483646 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedRevision!: number
}
export class RegisterPushDeviceDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
  @ApiProperty({ format: 'uuid' }) @IsUUID() installationId!: string
  @ApiProperty({ enum: ['STOREFRONT', 'ADMIN'] })
  @IsIn(['STOREFRONT', 'ADMIN'])
  surface!: 'STOREFRONT' | 'ADMIN'
  @ApiPropertyOptional({
    enum: ['REGISTRATION_TOKEN', 'FID'],
    description:
      'Defaults to registration-token compatibility; current Firebase installations may use FID',
  })
  @IsOptional()
  @IsIn(['REGISTRATION_TOKEN', 'FID'])
  identifierKind?: 'REGISTRATION_TOKEN' | 'FID'
  @ApiProperty({ writeOnly: true, minLength: 20, maxLength: 4096 })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  @Matches(/^[A-Za-z0-9_:.-]+(?![\s\S])/)
  token!: string
  @ApiProperty({
    enum: ['GRANTED'],
    description:
      'Explicit client acknowledgement; browser permission remains a client responsibility',
  })
  @IsIn(['GRANTED'])
  permission!: 'GRANTED'
}
export class PushDeviceDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) installationId!: string
  @ApiProperty() surface!: string
  @ApiProperty() status!: string
  @ApiProperty() revision!: number
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: Date
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date
}
export class PushPagingDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
export class PushDeliveryQueryDto extends PushPagingDto {
  @ApiPropertyOptional({
    enum: [
      'PENDING',
      'PROCESSING',
      'ACCEPTED',
      'SKIPPED',
      'FAILED',
      'REJECTED',
      'REQUIRES_REVIEW',
    ],
  })
  @IsOptional()
  @IsIn([
    'PENDING',
    'PROCESSING',
    'ACCEPTED',
    'SKIPPED',
    'FAILED',
    'REJECTED',
    'REQUIRES_REVIEW',
  ])
  status?: string
}
export class SavePushCampaignDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) title!: string
  @ApiProperty({ maxLength: 500 }) @IsString() @MaxLength(500) body!: string
  @ApiProperty({ enum: ['ALL_OPTED_IN_CUSTOMERS', 'SELECTED_CUSTOMERS'] })
  @IsIn(['ALL_OPTED_IN_CUSTOMERS', 'SELECTED_CUSTOMERS'])
  audience!: 'ALL_OPTED_IN_CUSTOMERS' | 'SELECTED_CUSTOMERS'
  @ApiPropertyOptional({ type: [String], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  selectedUserIds?: string[]
  @ApiProperty({ enum: ['HOME', 'PRODUCT', 'CATEGORY', 'COLLECTION', 'OFFER'] })
  @IsIn(['HOME', 'PRODUCT', 'CATEGORY', 'COLLECTION', 'OFFER'])
  targetType!: string
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string | null
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  imageMediaId?: string | null
}
export class ApprovePushCampaignDto extends PushRevisionDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Null/omitted starts when the worker next processes the approved campaign',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt?: string | null
}
export class PushCampaignDto {
  @ApiProperty() fanoutAttempts!: number
  @ApiProperty({ type: String, nullable: true }) fanoutFailureCode!:
    | string
    | null
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() title!: string
  @ApiProperty() body!: string
  @ApiProperty() audience!: string
  @ApiProperty() status!: string
  @ApiProperty() revision!: number
  @ApiProperty() targetType!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) targetId!:
    | string
    | null
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) imageMediaId!:
    | string
    | null
  @ApiProperty({ type: MerchandisingImageDto, nullable: true })
  image!: MerchandisingImageDto | null
  @ApiProperty({ type: [String] }) selectedUserIds!: string[]
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  scheduledAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  approvedAt!: Date | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt!: Date | null
}
export class PushCampaignPageDto {
  @ApiProperty({ type: [PushCampaignDto] }) items!: PushCampaignDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class PushPreviewDto {
  @ApiProperty() eligibleCustomers!: number
  @ApiProperty() eligibleDevices!: number
  @ApiProperty() targetPath!: string
  @ApiProperty({ type: MerchandisingImageDto, nullable: true })
  image!: MerchandisingImageDto | null
  @ApiProperty() providerInvoked!: boolean
}
export class PushMetricsDto {
  @ApiProperty() fanoutComplete!: boolean
  @ApiProperty() recipientsProcessed!: number
  @ApiProperty() inAppCreated!: number
  @ApiProperty() pushQueued!: number
  @ApiProperty() accepted!: number
  @ApiProperty() failed!: number
  @ApiProperty() skipped!: number
  @ApiProperty() pending!: number
  @ApiProperty({
    description:
      'Provider acceptance is not device display or click confirmation',
  })
  deviceDeliveryVerified!: boolean
}
export class PushStatusDto {
  @ApiProperty() mode!: string
  @ApiProperty() registrationConfigured!: boolean
  @ApiProperty() providerConfigured!: boolean
  @ApiProperty() providerVerified!: boolean
  @ApiProperty() platform!: string
}
export class PushDeliveryDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() kind!: string
  @ApiProperty() audience!: string
  @ApiProperty() status!: string
  @ApiProperty() attempts!: number
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  acceptedAt!: Date | null
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
}
export class PushDeliveryPageDto {
  @ApiProperty({ type: [PushDeliveryDto] }) items!: PushDeliveryDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class PushTargetDto {
  @ApiProperty() targetType!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) targetId!:
    | string
    | null
  @ApiProperty() surface!: string
}
export class PushPlanningFailureDto {
  @ApiProperty() eventId!: string
  @ApiProperty() status!: string
  @ApiProperty() attempts!: number
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null
  @ApiProperty({ format: 'date-time' }) nextAttemptAt!: Date
}
