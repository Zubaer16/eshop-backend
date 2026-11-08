import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  Injectable,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import { PushDevicesService } from './push-devices.service'
import { PushCampaignsService } from './push-campaigns.service'
import { PushReadService } from './push-read.service'
import { WebNotificationNavigationDto } from '../notifications/web-navigation'
import {
  ApprovePushCampaignDto,
  PushCampaignDto,
  PushCampaignPageDto,
  PushDeliveryPageDto,
  PushDeliveryQueryDto,
  PushDeviceDto,
  PushMetricsDto,
  PushPagingDto,
  PushPlanningFailureDto,
  PushPreviewDto,
  PushRevisionDto,
  PushStatusDto,
  PushTargetDto,
  RegisterPushDeviceDto,
  SavePushCampaignDto,
} from './push.dto'
@Injectable()
export class PushMarketingGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser
    if (
      actor?.role !== 'OWNER' &&
      !actor?.permissions?.includes('marketing.manage')
    )
      throw new ForbiddenException('marketing.manage required')
    return true
  }
}
@ApiTags('Push / Devices')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Current bearer authentication required',
})
@ApiForbiddenResponse({ description: 'Admin surface requires staff role' })
@ApiBadRequestResponse({
  description: 'Invalid canonical ID, token or revision',
})
@ApiNotFoundResponse({ description: 'Owned device/target not found' })
@ApiConflictResponse({ description: 'Device revision/token conflict' })
@ApiServiceUnavailableResponse({
  description: 'Push registration/database unavailable',
})
@Controller('notifications/push')
@UseGuards(AccessGuard)
export class PushDevicesController {
  constructor(
    private readonly devices: PushDevicesService,
    private readonly read: PushReadService,
  ) {}
  @Get('config')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushStatusDto })
  config() {
    return this.read.status()
  }
  @Get('devices')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [PushDeviceDto] })
  list(@Req() req: AuthenticatedRequest) {
    return this.devices.list(req.authUser!.id)
  }
  @Post('devices') @ApiCreatedResponse({ type: PushDeviceDto }) register(
    @Req() req: AuthenticatedRequest,
    @Body() input: RegisterPushDeviceDto,
  ) {
    return this.devices.register(req.authUser!, input)
  }
  @Delete('devices/:id') @ApiOkResponse({ type: PushDeviceDto }) revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PushRevisionDto,
  ) {
    return this.devices.revoke(req.authUser!.id, id, q.expectedRevision)
  }
  @Get('deliveries/:id/navigation')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WebNotificationNavigationDto })
  navigation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.read.navigation(req.authUser!, id)
  }
  @Get('deliveries/:id/target')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushTargetDto })
  target(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.read.target(req.authUser!, id)
  }
}
@ApiTags('Push / Campaigns')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff bearer required' })
@ApiForbiddenResponse({
  description: 'OWNER or marketing.manage; OWNER approval only',
})
@ApiBadRequestResponse({ description: 'Invalid campaign fields' })
@ApiNotFoundResponse({ description: 'Campaign/public target not found' })
@ApiConflictResponse({
  description: 'Stale revision or unavailable published target/image',
})
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@Controller('admin/push/campaigns')
@UseGuards(AccessGuard, AdminGuard, PushMarketingGuard)
export class PushCampaignsController {
  constructor(private readonly campaigns: PushCampaignsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushCampaignPageDto })
  list(@Query() q: PushPagingDto) {
    return this.campaigns.list(q)
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushCampaignDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id)
  }
  @Post() @ApiCreatedResponse({ type: PushCampaignDto }) create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SavePushCampaignDto,
  ) {
    return this.campaigns.save(null, dto, req.authUser!.id)
  }
  @Put(':id') @ApiOkResponse({ type: PushCampaignDto }) save(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePushCampaignDto,
  ) {
    return this.campaigns.save(id, dto, req.authUser!.id)
  }
  @Post(':id/approve')
  @UseGuards(NotificationOwnerGuard)
  @ApiCreatedResponse({ type: PushCampaignDto })
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePushCampaignDto,
  ) {
    return this.campaigns.approve(id, dto, req.authUser!.id)
  }
  @Post(':id/cancel') @ApiCreatedResponse({ type: PushCampaignDto }) cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PushRevisionDto,
  ) {
    return this.campaigns.cancel(id, dto.expectedRevision, req.authUser!.id)
  }
  @Get(':id/preview')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushPreviewDto })
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.preview(id)
  }
  @Get(':id/metrics')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushMetricsDto })
  metrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.metrics(id)
  }
}
@ApiTags('Push / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff bearer required' })
@ApiForbiddenResponse({ description: 'OWNER required' })
@ApiBadRequestResponse({ description: 'Invalid pagination/status' })
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@Controller('admin/push')
@UseGuards(AccessGuard, AdminGuard, NotificationOwnerGuard)
export class PushAdminController {
  constructor(private readonly read: PushReadService) {}
  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushStatusDto })
  status() {
    return this.read.status()
  }
  @Get('deliveries')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PushDeliveryPageDto })
  deliveries(@Query() q: PushDeliveryQueryDto) {
    return this.read.deliveries(q)
  }
  @Get('planning-failures')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [PushPlanningFailureDto] })
  failures(@Query() q: PushPagingDto) {
    return this.read.failures(q)
  }
}
