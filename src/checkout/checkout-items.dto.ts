import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { CouponSelectionDto } from '../promotions/promotions.dto'

export class CheckoutItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Browser cart line identity for stock correction feedback',
  })
  @IsUUID()
  id!: string
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  variantId?: string | null
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number
}
export class CheckoutItemsDto extends CouponSelectionDto {
  @ApiProperty({ type: [CheckoutItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[]
}
