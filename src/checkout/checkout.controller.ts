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
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
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
import { CustomerGuard } from '../auth/customer.guard'
import {
  CheckoutEstimateDto,
  CheckoutEstimateResponseDto,
  CheckoutRateResponseDto,
  PutCheckoutRateDto,
  PutCheckoutDefaultRateDto,
  CheckoutDefaultRateResponseDto,
} from './checkout.dto'
import { AvailableDeliveryOptionsDto } from './delivery-zones.dto'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import { CheckoutService } from './checkout.service'
import { ReservationService } from './reservation.service'
import {
  CreateReservationDto,
  CheckoutReservationResponseDto,
  CheckoutRecoveryResponseDto,
} from './reservation.dto'

@ApiTags('Checkout / Customer')
@ApiBearerAuth('access-token')
@Controller('checkout')
@UseGuards(AccessGuard, CustomerGuard)
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
    description: 'Requested delivery service is unavailable',
  })
  estimate(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutEstimateDto) {
    return this.checkout.estimate(req.authUser!.id, dto)
  }

  @Post('delivery-options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List live standard/express options for owned cart; legacy flat rate if no zone; JWT required',
  })
  @ApiOkResponse({ type: AvailableDeliveryOptionsDto })
  @ApiUnprocessableEntityResponse({
    description: 'Delivery service is unavailable for this destination',
  })
  deliveryOptions(
    @Req() req: AuthenticatedRequest,
    @Body() input: CheckoutEstimateDto,
  ) {
    return this.checkout.deliveryOptions(req.authUser!.id, input)
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
    description: 'Delivery service is unavailable for this destination',
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
@Controller('admin/checkout')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
@ApiUnauthorizedResponse({ description: 'Admin bearer JWT required' })
@ApiForbiddenResponse({
  description: 'Only OWNER may manage checkout rate policies',
})
export class CheckoutAdminController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('rates')
  @ApiOperation({
    summary:
      'List explicitly configured country/currency delivery estimate policies (OWNER)',
  })
  @ApiOkResponse({ type: [CheckoutRateResponseDto] })
  list() {
    return this.checkout.listRates()
  }

  @Put('rates')
  @ApiOperation({
    summary:
      'Idempotently configure one country/currency delivery estimate lane (OWNER)',
  })
  @ApiOkResponse({ type: CheckoutRateResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid delivery charges, currency or unsupported fields',
  })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutCheckoutRateDto) {
    return this.checkout.putRate(dto, req.authUser!.id)
  }

  @Get('defaults')
  @ApiOperation({
    summary: 'List store-wide default delivery policies by currency (OWNER)',
  })
  @ApiOkResponse({ type: [CheckoutDefaultRateResponseDto] })
  defaults() {
    return this.checkout.listDefaults()
  }

  @Put('defaults')
  @ApiOperation({
    summary:
      'Configure a currency default used across destinations without a country policy (OWNER)',
  })
  @ApiOkResponse({ type: CheckoutDefaultRateResponseDto })
  @ApiConflictResponse({
    description: 'The default policy was edited concurrently',
  })
  @ApiBadRequestResponse({
    description: 'Invalid currency, charges or revision',
  })
  putDefault(
    @Req() req: AuthenticatedRequest,
    @Body() input: PutCheckoutDefaultRateDto,
  ) {
    return this.checkout.putDefault(input, req.authUser!.id)
  }
}
