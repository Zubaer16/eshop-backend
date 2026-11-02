import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import {
  DeleteDeliveryZoneQueryDto,
  DeliveryZoneResponseDto,
  SaveDeliveryZoneDto,
} from './delivery-zones.dto'
import { DeliveryZonesService } from './delivery-zones.service'

@ApiTags('Delivery Zones / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({ description: 'OWNER only' })
@ApiConflictResponse({ description: 'Duplicate destination or stale revision' })
@Controller('admin/checkout/zones')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
export class DeliveryZonesAdminController {
  constructor(private readonly service: DeliveryZonesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List country/currency zones and standard/express shipping options',
  })
  @ApiOkResponse({ type: [DeliveryZoneResponseDto] })
  list() {
    return this.service.list()
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a zone, assign unique countries and both delivery options; no implicit tax policy',
  })
  @ApiCreatedResponse({ type: DeliveryZoneResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid country, money, option kinds or unknown fields',
  })
  create(@Body() input: SaveDeliveryZoneDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(input, req.authUser!.id)
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeliveryZoneResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SaveDeliveryZoneDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, input, req.authUser!.id)
  }

  @Delete(':id')
  @ApiOkResponse({
    description:
      'Revision-checked deletion. Historical order totals remain unchanged.',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteDeliveryZoneQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.delete(id, query.expectedRevision, req.authUser!.id)
  }
}
