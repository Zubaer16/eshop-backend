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
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiSecurity,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'
import {
  CartQuoteResponseDto,
  AddCartItemDto,
  GuestCartCreatedDto,
  GuestCartRevokedDto,
  SetCartItemDto,
} from './cart.dto'
import { GuestCartService } from './guest-cart.service'

/** The capability remains an HTTP header. Reading through @Req() avoids
 * generating a duplicate OpenAPI header *parameter* beside the API-key
 * security scheme, which causes Swagger UI to block Execute.
 */
function guestCapability(request: Request): string {
  return request.get('X-Guest-Cart-Token') ?? ''
}

/** Guest capability != JWT; no ability to call customer/admin endpoints. */
function draftView(view?: string) {
  if (view !== undefined && view !== 'draft')
    throw new BadRequestException('Unsupported cart view')
  return view === 'draft'
}

@ApiTags('Cart / Guest')
@Controller('guest-cart')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired or consumed guest cart capability',
})
export class GuestCartController {
  constructor(private readonly guest: GuestCartService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create anonymous cart; returns one-time 256-bit capability (never use in URL)',
  })
  @ApiCreatedResponse({ type: GuestCartCreatedDto })
  create() {
    return this.guest.create()
  }

  @Get()
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  get(@Req() request: Request, @Query('view') view?: string) {
    return this.guest.getQuote(guestCapability(request), draftView(view))
  }

  @Get('quote')
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  quote(@Req() request: Request) {
    return this.guest.getQuote(guestCapability(request))
  }

  @Post('items/add')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('guest-cart-token')
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
    @Req() req: Request,
    @Body() input: AddCartItemDto,
    @Query('view') view?: string,
  ) {
    return this.guest.addItem(guestCapability(req), input, draftView(view))
  }

  @Put('items')
  @ApiSecurity('guest-cart-token')
  @ApiBadRequestResponse({
    description: 'Invalid product, variant or quantity',
  })
  @ApiConflictResponse({
    description: 'Unpublished product, mixed currency or 50-line cap',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  put(
    @Req() request: Request,
    @Body() input: SetCartItemDto,
    @Query('view') view?: string,
  ) {
    return this.guest.setItem(guestCapability(request), input, draftView(view))
  }

  @Delete('items/:id')
  @ApiSecurity('guest-cart-token')
  @ApiNotFoundResponse({ description: 'Line not found in this guest cart' })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('view') view?: string,
  ) {
    return this.guest.removeItem(guestCapability(request), id, draftView(view))
  }

  @Delete('items')
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  @ApiQuery({ name: 'view', required: false, enum: ['draft'], description: 'Draft totals select display fields and defer inventory validation to final checkout' })
  clear(@Req() request: Request, @Query('view') view?: string) {
    return this.guest.clear(guestCapability(request), draftView(view))
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('guest-cart-token')
  @ApiOperation({
    summary: 'Revoke anonymous cart capability and delete its items',
  })
  @ApiOkResponse({
    type: GuestCartRevokedDto,
    description: 'Guest capability revoked',
  })
  revoke(@Req() request: Request) {
    return this.guest.revoke(guestCapability(request))
  }
}
