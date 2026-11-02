import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CheckoutOwnerGuard } from '../checkout/checkout.owner.guard'
import {
  AdminStoreOperationsDto,
  PublicStoreOperationsDto,
  PutStoreOperationsDto,
} from './store-operations.dto'
import { StoreOperationsService } from './store-operations.service'

@ApiTags('Store Operations / Public')
@Controller('store/operations')
export class PublicStoreOperationsController {
  constructor(private readonly service: StoreOperationsService) {}
  @Get()
  @ApiOperation({
    summary:
      'Safe display configuration and explicit guest checkout policy; not a CORS or payment authority',
  })
  @ApiOkResponse({ type: PublicStoreOperationsDto })
  @ApiServiceUnavailableResponse({
    description: 'Authoritative store configuration is unavailable',
  })
  get() {
    return this.service.publicOperations()
  }
}

@ApiTags('Store Operations / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'JWT required' })
@ApiForbiddenResponse({ description: 'OWNER only' })
@Controller('admin/store/operations')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
export class AdminStoreOperationsController {
  constructor(private readonly service: StoreOperationsService) {}
  @Get()
  @ApiOkResponse({ type: AdminStoreOperationsDto })
  get() {
    return this.service.adminOperations()
  }
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminStoreOperationsDto })
  @ApiBadRequestResponse({
    description: 'Invalid locale, origin, currency or fields',
  })
  @ApiConflictResponse({ description: 'Stale revision' })
  put(@Body() input: PutStoreOperationsDto, @Req() req: AuthenticatedRequest) {
    return this.service.put(input, req.authUser!.id)
  }
}
