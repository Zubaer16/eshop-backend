import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
export class EmailPagingDto {
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
export class EmailPageQueryDto extends EmailPagingDto {
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
export class SaveEmailTemplateDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) subject!: string
  @ApiProperty({ maxLength: 1800 }) @IsString() @MaxLength(1800) text!: string
}
export class EmailTemplateDto {
  @ApiProperty() key!: string
  @ApiProperty() subject!: string
  @ApiProperty() text!: string
  @ApiProperty() revision!: number
}
export class EmailStatusDto {
  @ApiProperty({ enum: ['disabled', 'controlled', 'production'] }) mode!: string
  @ApiProperty() provider!: string
  @ApiProperty() configured!: boolean
  @ApiProperty() senderConfigured!: boolean
  @ApiProperty() controlledRecipientCount!: number
  @ApiProperty() tlsMode!: string
  @ApiProperty({
    description:
      'Configuration presence only; no SMTP connection/send was performed',
  })
  providerVerified!: boolean
}
export class EmailDeliveryDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() kind!: string
  @ApiProperty() audience!: string
  @ApiProperty() status!: string
  @ApiProperty() attempts!: number
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty({ format: 'date-time' }) nextAttemptAt!: Date
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  acceptedAt!: Date | null
}
export class EmailDeliveryPageDto {
  @ApiProperty({ type: [EmailDeliveryDto] }) items!: EmailDeliveryDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pages!: number
}
export class EmailPlanningFailureDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string
  @ApiProperty() eventType!: string
  @ApiProperty() status!: string
  @ApiProperty() attempts!: number
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null
  @ApiProperty({ format: 'date-time' }) nextAttemptAt!: Date
}
