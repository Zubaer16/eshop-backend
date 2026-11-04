import { MerchandisingImageDto } from '../merchandising/merchandising.dto'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class NotificationQueryDto {
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
  @ApiPropertyOptional({ enum: ['all', 'unread'] })
  @IsOptional()
  @IsIn(['all', 'unread'])
  readState?: 'all' | 'unread'
}
export class ReadNotificationDto {
  @ApiProperty() @IsBoolean() read!: boolean
}
export class ReadAllNotificationsDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'Only items created at or before this explicit timestamp are marked read',
  })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  before!: string
}
export class SaveNotificationPreferencesDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
  @ApiProperty() @IsBoolean() transactionalEmail!: boolean
  @ApiProperty() @IsBoolean() transactionalPush!: boolean
  @ApiProperty() @IsBoolean() operationalInApp!: boolean
  @ApiProperty() @IsBoolean() operationalEmail!: boolean
  @ApiProperty() @IsBoolean() operationalPush!: boolean
  @ApiProperty() @IsBoolean() marketingInApp!: boolean
  @ApiProperty() @IsBoolean() marketingEmail!: boolean
  @ApiProperty() @IsBoolean() marketingPush!: boolean
}
export class SaveNotificationTemplateDto {
  @ApiProperty({
    minimum: 0,
    maximum: 2147483646,
    description: '0 replaces built-in default with first persisted revision',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) title!: string
  @ApiProperty({ maxLength: 600 }) @IsString() @MaxLength(600) body!: string
}
export class NotificationItemDto {
  @ApiProperty({ type: MerchandisingImageDto, nullable: true })
  image!: MerchandisingImageDto | null
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() kind!: string
  @ApiProperty() title!: string
  @ApiProperty() body!: string
  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN', 'SECURITY', 'MARKETING'] })
  audience!: string
  @ApiProperty({
    enum: [
      'ORDER',
      'TRACKING',
      'PRODUCT',
      'HOME',
      'CATEGORY',
      'COLLECTION',
      'OFFER',
    ],
  })
  targetType!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) targetId!:
    | string
    | null
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  readAt!: Date | null
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
}
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationItemDto] }) items!: NotificationItemDto[]
  @ApiProperty() total!: number
  @ApiProperty() unread!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class NotificationPreferencesDto {
  @ApiProperty() revision!: number
  @ApiProperty() transactionalEmail!: boolean
  @ApiProperty() transactionalPush!: boolean
  @ApiProperty() operationalInApp!: boolean
  @ApiProperty() operationalEmail!: boolean
  @ApiProperty() operationalPush!: boolean
  @ApiProperty() marketingInApp!: boolean
  @ApiProperty() marketingEmail!: boolean
  @ApiProperty() marketingPush!: boolean
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  marketingConsentAt!: Date | null
  @ApiProperty({
    description:
      'Security email is mandatory and is not disabled by marketing consent',
  })
  securityEmailRequired!: boolean
  @ApiProperty({
    description:
      'Required transactional/security in-app history is always retained',
  })
  transactionalInAppRequired!: boolean
}
export class NotificationTemplateDto {
  @ApiProperty() key!: string
  @ApiProperty() title!: string
  @ApiProperty() body!: string
  @ApiProperty() revision!: number
}
export class NotificationReadResultDto {
  @ApiProperty() changed!: number
}
export class NotificationTargetDto {
  @ApiProperty() targetType!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) targetId!:
    | string
    | null
}
export class NotificationFailureDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string
  @ApiProperty() eventType!: string
  @ApiProperty() attempts!: number
  @ApiProperty() failureCode!: string | null
  @ApiProperty({ format: 'date-time' }) nextAttemptAt!: Date
  @ApiProperty() exhausted!: boolean
}
