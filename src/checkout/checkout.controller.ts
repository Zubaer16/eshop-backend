import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiProperty,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import {
  CheckoutEstimateDto,
  CheckoutEstimateResponseDto,
  CheckoutRateResponseDto,
  PutCheckoutRateDto,
} from './checkout.dto'
import { AvailableDeliveryOptionsDto } from './delivery-zones.dto'
import { Matches, IsString } from 'class-validator'
import { CouponSelectionDto } from '../promotions/promotions.dto'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import { CheckoutService } from './checkout.service'
import { ReservationService } from './reservation.service'
import {
  CreateReservationDto,
  CheckoutReservationResponseDto,
  CheckoutRecoveryResponseDto,
} from './reservation.dto'

class DeliveryCountryQueryDto extends CouponSelectionDto {
  @ApiProperty({
    example: 'US',
    description: 'ISO 3166-1 alpha-2 country; cart currency is server-owned',
  })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string
}

@ApiTags('Checkout / Customer')
@ApiBearerAuth('access-token')
@Controller('checkout')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer JWT required' })
@ApiForbiddenResponse({ description: 'Not a customer account' })
export class CheckoutCustomerController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly reservations: ReservationService,
  ) {}

  @Get('recovery')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Recover own hold/latest unpaid order; no address or provider secrets',
  })
  @ApiOkResponse({ type: CheckoutRecoveryResponseDto })
  recovery(@Req() req: AuthenticatedRequest) {
    return this.reservations.recovery(req.authUser!.id)
  }

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Read-only live checkout estimate for a configured country/currency; no stock hold or payment',
  })
  @ApiOkResponse({ type: CheckoutEstimateResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid ISO country code / unknown request fields',
  })
  @ApiConflictResponse({
    description: 'Empty, unavailable or mixed-currency cart; quote changed',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'No enabled configured country/currency shipping and tax policy',
  })
  estimate(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutEstimateDto) {
    return this.checkout.estimate(req.authUser!.id, dto)
  }

  @Get('delivery-options')
  @ApiOperation({
    summary:
      'List live standard/express options for owned cart; legacy flat rate if no zone; JWT required',
  })
  @ApiOkResponse({ type: AvailableDeliveryOptionsDto })
  @ApiUnprocessableEntityResponse({
    description: 'No enabled country/currency lane',
  })
  deliveryOptions(
    @Req() req: AuthenticatedRequest,
    @Query() query: DeliveryCountryQueryDto,
  ) {
    return this.checkout.deliveryOptions(
      req.authUser!.id,
      query.countryCode,
      query.couponCode,
    )
  }

  @Post('reservations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hold currently available SKU quantities for 10 minutes (idempotent); NOT an order/payment',
  })
  @ApiOkResponse({ type: CheckoutReservationResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid requestId or countryCode; client cannot supply totals',
  })
  @ApiConflictResponse({
    description:
      'Active hold exists, invalid cart, or insufficient unreserved stock',
  })
  @ApiUnprocessableEntityResponse({
    description: 'No enabled country/currency policy',
  })
  reserve(@Req() req: AuthenticatedRequest, @Body() dto: CreateReservationDto) {
    return this.reservations.reserve(req.authUser!.id, dto)
  }

  @Get('reservations/:id')
  @ApiOperation({
    summary: 'Read own hold; expired holds are released atomically',
  })
  @ApiOkResponse({ type: CheckoutReservationResponseDto })
  @ApiNotFoundResponse({
    description: 'Unknown reservation or not owned by authenticated customer',
  })
  reservation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservations.get(req.authUser!.id, id)
  }

  @Delete('reservations/:id')
  @ApiOperation({
    summary: 'Idempotently release own stock hold; payment/order not created',
  })
  @ApiOkResponse({ type: CheckoutReservationResponseDto })
  @ApiNotFoundResponse({
    description: 'Unknown reservation or not owned by authenticated customer',
  })
  release(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservations.release(req.authUser!.id, id)
  }
}

@ApiTags('Checkout / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/checkout/rates')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
@ApiUnauthorizedResponse({ description: 'Admin bearer JWT required' })
@ApiForbiddenResponse({
  description: 'Only OWNER may manage checkout rate policies',
})
export class CheckoutAdminController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get()
  @ApiOperation({
    summary:
      'List explicitly configured country/currency shipping and tax estimate policies (OWNER)',
  })
  @ApiOkResponse({ type: [CheckoutRateResponseDto] })
  list() {
    return this.checkout.listRates()
  }

  @Put()
  @ApiOperation({
    summary:
      'Idempotently configure one country/currency shipping/tax estimate lane (OWNER)',
  })
  @ApiOkResponse({ type: CheckoutRateResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid rates, money bounds, tax basis points or unsupported fields',
  })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutCheckoutRateDto) {
    return this.checkout.putRate(dto, req.authUser!.id)
  }
}
