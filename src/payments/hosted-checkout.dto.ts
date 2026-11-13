import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDefined, ValidateNested } from 'class-validator'
import { CreateReservationDto } from '../checkout/reservation.dto'
import { OrderShippingAddressDto } from '../orders/orders.dto'

export class StartHostedCheckoutDto extends CreateReservationDto {
  @ApiProperty({ type: OrderShippingAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => OrderShippingAddressDto)
  shippingAddress!: OrderShippingAddressDto
}
export class HostedCheckoutResponseDto {
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty() sessionId!: string
  @ApiProperty({ format: 'uri' }) url!: string
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date
}
