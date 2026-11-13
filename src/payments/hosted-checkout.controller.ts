import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { HostedCheckoutService } from './hosted-checkout.service'
import {
  HostedCheckoutResponseDto,
  StartHostedCheckoutDto,
} from './hosted-checkout.dto'
import { OrderResponseDto } from '../orders/orders.dto'
import type { Request } from 'express'
import { OrdersService } from '../orders/orders.service'
import { PaymentSettlementService } from './payment-settlement.service'

@ApiTags('Checkout / Customer')
@ApiBearerAuth('access-token')
@UseGuards(AccessGuard, CustomerCartGuard)
@Controller('checkout')
export class HostedCheckoutController {
  constructor(
    private readonly checkout: HostedCheckoutService,
    private readonly settlements: PaymentSettlementService,
    private readonly orders: OrdersService,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Validate and reserve current stock, create an owned order and redirect to Stripe TEST Checkout',
  })
  @ApiOkResponse({ type: HostedCheckoutResponseDto })
  @ApiConflictResponse({
    description:
      'INSUFFICIENT_STOCK includes requested and available quantities for each affected cart line',
  })
  start(
    @Req() req: AuthenticatedRequest & Request,
    @Body() input: StartHostedCheckoutDto,
  ) {
    return this.checkout.start(req.authUser!.id, input, req.get('origin'))
  }

  @Post('orders/:orderId/session')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: HostedCheckoutResponseDto })
  resume(
    @Req() req: AuthenticatedRequest & Request,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.checkout.resume(req.authUser!.id, id, req.get('origin'))
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Expire the owned Stripe Checkout Session before releasing its stock allocation',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  cancel(
    @Req() req: AuthenticatedRequest & Request,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.checkout.cancel(req.authUser!.id, id)
  }
  @Post('orders/:orderId/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OrderResponseDto })
  async reconcile(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    await this.settlements.reconcileOrder(req.authUser!.id, id)
    return this.orders.get(req.authUser!.id, id)
  }
}
