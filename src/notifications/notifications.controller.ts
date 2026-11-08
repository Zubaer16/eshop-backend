import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  Injectable,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { NotificationsService } from './notifications.service'
import { WebNotificationNavigationDto } from './web-navigation'
import {
  NotificationFailureDto,
  NotificationItemDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  NotificationQueryDto,
  NotificationReadResultDto,
  NotificationTargetDto,
  NotificationTemplateDto,
  ReadAllNotificationsDto,
  ReadNotificationDto,
  SaveNotificationPreferencesDto,
  SaveNotificationTemplateDto,
} from './notifications.dto'

@Injectable()
export class NotificationOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      context.switchToHttp().getRequest<AuthenticatedRequest>().authUser
        ?.role !== 'OWNER'
    )
      throw new ForbiddenException('OWNER required')
    return true
  }
}
@ApiTags('Notifications / Inbox')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current authenticated user required' })
@ApiBadRequestResponse({ description: 'Invalid fields or pagination' })
@ApiNotFoundResponse({
  description: 'Owned visible notification or target not found',
})
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@Controller('notifications')
@UseGuards(AccessGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiOperation({
    summary:
      'Own persisted inbox; staff visibility follows current permissions',
  })
  inbox(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.service.inbox(req.authUser!, query)
  }
  @Get(':id/navigation')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WebNotificationNavigationDto })
  navigation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.navigation(req.authUser!, id)
  }
  @Get('preferences')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(@Req() req: AuthenticatedRequest) {
    return this.service.getPreferences(req.authUser!.id)
  }
  @Put('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  @ApiConflictResponse({ description: 'Stale preference revision' })
  savePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveNotificationPreferencesDto,
  ) {
    return this.service.savePreferences(req.authUser!.id, dto)
  }
  @Put('read-all')
  @ApiOkResponse({ type: NotificationReadResultDto })
  readAll(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReadAllNotificationsDto,
  ) {
    return this.service.readAll(req.authUser!, new Date(dto.before))
  }
  @Put(':id/read')
  @ApiOkResponse({ type: NotificationItemDto })
  read(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReadNotificationDto,
  ) {
    return this.service.read(req.authUser!, id, dto.read)
  }
  @Get(':id/target')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: NotificationTargetDto })
  target(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.target(req.authUser!, id)
  }
}
@ApiTags('Notifications / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff JWT required' })
@ApiForbiddenResponse({
  description: 'OWNER required for template/failure administration',
})
@ApiBadRequestResponse({
  description: 'Invalid plain text, placeholders or revision',
})
@ApiNotFoundResponse({ description: 'Built-in template key not found' })
@ApiConflictResponse({ description: 'Stale template revision' })
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@Controller('admin/notifications')
@UseGuards(AccessGuard, AdminGuard, NotificationOwnerGuard)
export class NotificationsAdminController {
  constructor(private readonly service: NotificationsService) {}
  @Get('templates')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [NotificationTemplateDto] })
  templates() {
    return this.service.templates()
  }
  @Put('templates/:key')
  @ApiOkResponse({ type: NotificationTemplateDto })
  saveTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('key') key: string,
    @Body() dto: SaveNotificationTemplateDto,
  ) {
    return this.service.saveTemplate(key, dto, req.authUser!.id)
  }
  @Get('failures')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [NotificationFailureDto] })
  failures(@Query() query: NotificationQueryDto) {
    return this.service.failures(query)
  }
}
