import {
  Body,
  Controller,
  Get,
  Header,
  Param,
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
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { EmailAdminService } from './email-admin.service'
import {
  EmailDeliveryPageDto,
  EmailPageQueryDto,
  EmailPagingDto,
  EmailPlanningFailureDto,
  EmailStatusDto,
  EmailTemplateDto,
  SaveEmailTemplateDto,
} from './email.dto'
@ApiTags('Email / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff JWT required' })
@ApiForbiddenResponse({ description: 'OWNER required' })
@ApiBadRequestResponse({ description: 'Invalid template/pagination' })
@ApiConflictResponse({ description: 'Stale template revision' })
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@Controller('admin/email')
@UseGuards(AccessGuard, AdminGuard, NotificationOwnerGuard)
export class EmailAdminController {
  constructor(private readonly service: EmailAdminService) {}
  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EmailStatusDto })
  status() {
    return this.service.status()
  }
  @Get('templates')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [EmailTemplateDto] })
  templates() {
    return this.service.templates()
  }
  @Put('templates/:key')
  @ApiOkResponse({ type: EmailTemplateDto })
  saveTemplate(
    @Param('key') key: string,
    @Body() dto: SaveEmailTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveTemplate(key, dto, req.authUser!.id)
  }
  @Get('deliveries')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EmailDeliveryPageDto })
  deliveries(@Query() q: EmailPageQueryDto) {
    return this.service.deliveries(q)
  }
  @Get('planning-failures')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [EmailPlanningFailureDto] })
  planning(@Query() q: EmailPagingDto) {
    return this.service.planningFailures(q)
  }
}
