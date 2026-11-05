import { createHash, timingSafeEqual } from 'node:crypto'
import {
  Controller,
  Get,
  Post,
  Req,
  Headers,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import type { Environment } from '../config/environment'
import { JobsService } from './jobs.service'
import { JobsOperationsService } from './jobs-operations.service'
import { RunsQueryDto } from './jobs.dto'

@ApiTags('Jobs / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({
  description: 'Current staff authentication required',
})
@ApiForbiddenResponse({ description: 'OWNER required' })
@ApiServiceUnavailableResponse({ description: 'Database unavailable' })
@UseGuards(AccessGuard, AdminGuard, NotificationOwnerGuard)
@Controller('admin/jobs')
export class JobsAdminController {
  constructor(private readonly ops: JobsOperationsService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read safe bounded scheduler and worker status' })
  @ApiOkResponse({ schema: { type: 'object' } })
  status() {
    return this.ops.status()
  }

  @Get('runs')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read bounded sanitized scheduler run metadata' })
  @ApiOkResponse({ schema: { type: 'object' } })
  runs(@Query() query: RunsQueryDto) {
    return this.ops.runs(query.limit ?? 50)
  }

  @Get('failures')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read bounded PII-free failure and review indicators',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  failures() {
    return this.ops.failures()
  }

  @Post('retry-notification/:id')
  @ApiOperation({
    summary:
      'OWNER audited retry of exhausted DB-only in-app receipt; never retries provider submissions',
  })
  @ApiOkResponse({ schema: { type: 'object' } })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ops.retryNotificationReceipt(id, req.authUser!.id)
  }
}

/** Vercel CRON uses GET and Bearer JOBS_CRON_SECRET; disabled by default. */
@Controller('internal/jobs')
export class JobsCronController {
  constructor(
    private readonly jobs: JobsService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  @Get('tick')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  tick(@Headers('authorization') authorization?: string) {
    if (!this.config.get('JOBS_CRON_ENABLED', { infer: true }))
      throw new ServiceUnavailableException('Cron disabled')
    const secret = this.config.get('JOBS_CRON_SECRET', { infer: true })
    const expected = createHash('sha256')
      .update('Bearer ' + secret)
      .digest()
    const actual = createHash('sha256')
      .update(authorization ?? '')
      .digest()
    if (!authorization || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException('Invalid job authorization')
    return this.jobs.tick('CRON', undefined, true)
  }
}
