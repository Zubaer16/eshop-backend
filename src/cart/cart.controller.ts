import {
  Body,
  BadRequestException,
  Query,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CartService } from './cart.service'
import { CustomerCartGuard } from './cart.customer.guard'
import { GuestCartService } from './guest-cart.service'
import {
  CartQuoteResponseDto,
  AddCartItemDto,
  MergeGuestCartDto,
  SetCartItemDto,
} from './cart.dto'

function draftView(view?: string) {
  if (view !== undefined && view !== 'draft')
    throw new BadRequestException('Unsupported cart view')
  return view === 'draft'
}

@ApiTags('Cart / Customer')
@Controller('cart')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT bearer token' })
@ApiForbiddenResponse({ description: 'Not a customer account' })
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly guest: GuestCartService,
  ) {}

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atomically merge an anonymous cart into this JWT-authenticated customer cart; same-token retries do not double-add',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid guest capability format' })
  @ApiConflictResponse({
    description:
      'Invalid item, unavailable stock, currency mismatch, full cart or token already consumed by another customer',
  })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  merge(
    @Req() req: AuthenticatedRequest,
    @Body() body: MergeGuestCartDto,
    @Query('view') view?: string,
  ) {
    return this.guest.merge(req.authUser!.id, body.guestToken, draftView(view))
  }

  @Get()
  @ApiOperation({
    summary:
      'Read persisted customer cart with live quote; no stock reservation',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  get(@Req() req: AuthenticatedRequest, @Query('view') view?: string) {
    return this.cart.getQuote(req.authUser!.id, draftView(view))
  }

  @Get('quote')
  @ApiOperation({
    summary:
      'Recalculate price, currency, publication and inventory from authoritative DB',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  quote(@Req() req: AuthenticatedRequest) {
    return this.cart.getQuote(req.authUser!.id)
  }

  @Post('items/add')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atomically add quantity once per requestId; returns current authoritative cart quote',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid UUID, quantity or variant' })
  @ApiConflictResponse({
    description:
      'Request reuse mismatch, unpublished product, mixed currency, full cart or active checkout reservation',
  })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  add(
    @Req() req: AuthenticatedRequest,
    @Body() input: AddCartItemDto,
    @Query('view') view?: string,
  ) {
    return this.cart.addItem(req.authUser!.id, input, draftView(view))
  }

  @Put('items')
  @ApiBadRequestResponse({
    description: 'Invalid quantity, UUID, or variant selection',
  })
  @ApiConflictResponse({
    description:
      'Unpublished product, currency mismatch, cart full or active checkout reservation',
  })
  @ApiOperation({
    summary:
      'Set absolute line quantity (idempotent); price/stock never accepted from client',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  put(
    @Req() req: AuthenticatedRequest,
    @Body() input: SetCartItemDto,
    @Query('view') view?: string,
  ) {
    return this.cart.setItem(req.authUser!.id, input, draftView(view))
  }

  @Delete('items/:id')
  @ApiNotFoundResponse({
    description: 'Item does not exist in this customer cart',
  })
  @ApiOperation({
    summary: 'Remove only an item owned by authenticated customer',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('view') view?: string,
  ) {
    return this.cart.removeItem(req.authUser!.id, id, draftView(view))
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the authenticated customer cart' })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  clear(@Req() req: AuthenticatedRequest, @Query('view') view?: string) {
    return this.cart.clear(req.authUser!.id, draftView(view))
  }
}
