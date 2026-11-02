import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import {
  CouponResponseDto,
  PromotionCampaignResponseDto,
  PromotionPageQueryDto,
  PromotionRevisionQueryDto,
  PublicPromotionCampaignDto,
  SaveCouponDto,
  SavePromotionCampaignDto,
  CouponPageResponseDto,
  CampaignPageResponseDto,
  CouponUsageResponseDto,
  DisabledPromotionResponseDto,
} from './promotions.dto'
import { PromotionsManageGuard } from './promotions.guard'
import { PromotionsService } from './promotions.service'

@ApiTags('Promotions / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({ description: 'marketing.manage or OWNER required' })
@ApiBadRequestResponse({ description: 'Invalid fields, references or window' })
@ApiConflictResponse({ description: 'Duplicate code/slug or stale revision' })
@ApiNotFoundResponse({ description: 'Promotion not found' })
@Controller('admin/promotions')
@UseGuards(AccessGuard, AdminGuard, PromotionsManageGuard)
export class PromotionsAdminController {
  constructor(private readonly service: PromotionsService) {}

  @Get('coupons')
  @ApiOperation({
    summary:
      'Paginated coupon rules; fixed minor units or percent basis points',
  })
  @ApiOkResponse({ type: CouponPageResponseDto })
  coupons(@Query() query: PromotionPageQueryDto) {
    return this.service.listCoupons(query)
  }
  @Get('coupons/:id')
  @ApiOkResponse({ type: CouponResponseDto })
  coupon(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCoupon(id)
  }
  @Get('coupons/:id/usage')
  @ApiOperation({
    summary:
      'Current active quota claims without customer identity or order PII',
  })
  @ApiOkResponse({ type: CouponUsageResponseDto })
  usage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.couponUsage(id)
  }
  @Post('coupons')
  @ApiOperation({
    summary:
      'Create a coupon; expectedRevision 0. Does not change prices or orders.',
  })
  @ApiCreatedResponse({ type: CouponResponseDto })
  createCoupon(@Body() dto: SaveCouponDto, @Req() req: AuthenticatedRequest) {
    return this.service.saveCoupon(null, dto, req.authUser!.id)
  }
  @Put('coupons/:id')
  @ApiOperation({
    summary:
      'Revision-checked coupon replacement; prior reservation/order snapshots remain immutable',
  })
  @ApiOkResponse({ type: CouponResponseDto })
  updateCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCouponDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCoupon(id, dto, req.authUser!.id)
  }
  @Delete('coupons/:id')
  @ApiOperation({
    summary:
      'Disable with current revision; preserve rule identity, ledger and existing holds',
  })
  @ApiOkResponse({ type: DisabledPromotionResponseDto })
  disableCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PromotionRevisionQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.disable(id, query.expectedRevision, req.authUser!.id)
  }
  @Get('campaigns')
  @ApiOkResponse({ type: CampaignPageResponseDto })
  campaigns(@Query() query: PromotionPageQueryDto) {
    return this.service.listCampaigns(query)
  }
  @Get('campaigns/:id')
  @ApiOkResponse({ type: PromotionCampaignResponseDto })
  campaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCampaign(id)
  }
  @Post('campaigns')
  @ApiOperation({
    summary:
      'Create editorial promotion campaign; no push delivery or automatic pricing',
  })
  @ApiCreatedResponse({ type: PromotionCampaignResponseDto })
  createCampaign(
    @Body() dto: SavePromotionCampaignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCampaign(null, dto, req.authUser!.id)
  }
  @Put('campaigns/:id')
  @ApiOkResponse({ type: PromotionCampaignResponseDto })
  updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePromotionCampaignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCampaign(id, dto, req.authUser!.id)
  }
  @Delete('campaigns/:id')
  @ApiOperation({
    summary:
      'Pause campaign using current revision; preserve coupon associations and history',
  })
  @ApiOkResponse({ type: DisabledPromotionResponseDto })
  pauseCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PromotionRevisionQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.disable(
      id,
      query.expectedRevision,
      req.authUser!.id,
      true,
    )
  }
}

@ApiTags('Promotions / Public')
@Controller('promotions/campaigns')
export class PromotionsPublicController {
  constructor(private readonly service: PromotionsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Paginated active-in-window public campaign summaries; never coupon codes, limits or drafts',
  })
  @ApiOkResponse({ type: [PublicPromotionCampaignDto] })
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  @ApiServiceUnavailableResponse({
    description: 'Storage unavailable; no fabricated campaigns',
  })
  list(@Query() query: PromotionPageQueryDto) {
    return this.service.publicCampaigns(query)
  }
}
