import { ApiProperty } from '@nestjs/swagger'
export class InventoryBalanceResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) variantId!:
    | string
    | null
  @ApiProperty() sku!: string
  @ApiProperty() title!: string
  @ApiProperty({ type: 'integer' }) onHand!: number
  @ApiProperty({ type: 'integer' }) reservedQuantity!: number
  @ApiProperty({ type: 'integer' }) availableQuantity!: number
  @ApiProperty({ type: 'integer' }) lowStockThreshold!: number
  @ApiProperty() lowStock!: boolean
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
}
export class InventoryMovementResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) balanceId!: string
  @ApiProperty({ format: 'uuid' }) requestId!: string
  @ApiProperty({
    enum: [
      'OPENING',
      'RECEIPT',
      'RETURN',
      'DAMAGE',
      'CORRECTION',
      'SALE',
      'REPLACEMENT',
    ],
  })
  reason!: string
  @ApiProperty({ type: 'integer' }) delta!: number
  @ApiProperty({ type: 'integer' }) before!: number
  @ApiProperty({ type: 'integer' }) after!: number
  @ApiProperty() note!: string
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}
class InventoryPageDto {
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() pages!: number
}
export class InventoryBalancePageDto extends InventoryPageDto {
  @ApiProperty({ type: [InventoryBalanceResponseDto] })
  items!: InventoryBalanceResponseDto[]
}
export class InventoryMovementPageDto extends InventoryPageDto {
  @ApiProperty({ type: [InventoryMovementResponseDto] })
  items!: InventoryMovementResponseDto[]
}
export class InventoryAdjustmentResponseDto {
  @ApiProperty({ type: InventoryMovementResponseDto })
  movement!: InventoryMovementResponseDto
  @ApiProperty({ type: InventoryBalanceResponseDto })
  inventory!: InventoryBalanceResponseDto
  @ApiProperty() replayed!: boolean
}
