import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Response } from 'express'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { ReportingDataService } from './reporting-data.service'
import { ReportingExportService } from './reporting-export.service'
import {
  ReportAccess,
  ReportExportAccess,
  ReportsGuard,
} from './reporting.guard'
import { exportKinds } from './reporting.policy'
import {
  ActivityPageDto,
  ActivityQueryDto,
  CustomerPerformanceQueryDto,
  CustomerReportPageDto,
  DailyCollectionsDto,
  DashboardDto,
  FinancialReportQueryDto,
  FinancialSummaryDto,
  InventoryReportPageDto,
  InventoryReportQueryDto,
  OrdersReportPageDto,
  OrdersReportQueryDto,
  PaymentsReportPageDto,
  PaymentsReportQueryDto,
  ProductPerformanceQueryDto,
  ProductReportPageDto,
  ReportExportQueryDto,
  SeriesReportQueryDto,
} from './reporting.dto'
@ApiTags('Reports / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff bearer required' })
@ApiForbiddenResponse({
  description: 'Current granular report permissions required',
})
@ApiBadRequestResponse({
  description: 'Invalid UTC window, currency, filters or bounded export',
})
@ApiServiceUnavailableResponse({
  description: 'Database/query budget unavailable',
})
@Controller('admin/reports')
@UseGuards(AccessGuard, AdminGuard, ReportsGuard)
export class ReportsController {
  constructor(
    private readonly data: ReportingDataService,
    private readonly exports: ReportingExportService,
  ) {}
  @Get('financial')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('payments.view')
  @ApiOkResponse({ type: FinancialSummaryDto })
  @ApiOperation({
    summary:
      'Verified TEST collections/refunds by currency and independent event date; no FX',
  })
  financial(@Query() q: FinancialReportQueryDto) {
    return this.data.financial(q)
  }
  @Get('daily')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('payments.view')
  @ApiOkResponse({ type: DailyCollectionsDto })
  daily(@Query() q: SeriesReportQueryDto) {
    return this.data.daily(q)
  }
  @Get('orders')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('orders.manage')
  @ApiOkResponse({ type: OrdersReportPageDto })
  orders(@Query() q: OrdersReportQueryDto) {
    return this.data.orders(q)
  }
  @Get('payments')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('payments.view')
  @ApiOkResponse({ type: PaymentsReportPageDto })
  payments(@Query() q: PaymentsReportQueryDto) {
    return this.data.payments(q)
  }
  @Get('products')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('payments.view', 'catalog.manage')
  @ApiOkResponse({ type: ProductReportPageDto })
  products(@Query() q: ProductPerformanceQueryDto) {
    return this.data.products(q)
  }
  @Get('customers')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('payments.view', 'customers.view')
  @ApiOkResponse({ type: CustomerReportPageDto })
  customers(@Query() q: CustomerPerformanceQueryDto) {
    return this.data.customers(q)
  }
  @Get('inventory')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('inventory.adjust')
  @ApiOkResponse({ type: InventoryReportPageDto })
  inventory(@Query() q: InventoryReportQueryDto) {
    return this.data.inventory(q)
  }
  @Get('export/:kind')
  @ReportExportAccess()
  @ApiProduces('text/csv')
  @ApiParam({ name: 'kind', enum: exportKinds })
  @ApiOkResponse({
    schema: { type: 'string', format: 'binary' },
    description:
      'UTF-8 CSV with formula neutralization, max 1000 rows / 5 MiB; audited before response',
  })
  async export(
    @Param('kind') kind: string,
    @Query() q: ReportExportQueryDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exports.export(kind, q, req.authUser!.id)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + result.filename + '"',
    )
    res.setHeader('X-Export-Row-Count', String(result.rowCount))
    return result.body
  }
}
@ApiTags('Dashboard / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff bearer required' })
@ApiForbiddenResponse({
  description:
    'dashboard.view required; each section additionally checks its domain grant',
})
@ApiBadRequestResponse({ description: 'Invalid UTC window/currency' })
@ApiServiceUnavailableResponse({
  description: 'Database/query budget unavailable',
})
@Controller('admin/dashboard')
@UseGuards(AccessGuard, AdminGuard, ReportsGuard)
export class DashboardController {
  constructor(private readonly data: ReportingDataService) {}
  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @ReportAccess('dashboard.view')
  @ApiOkResponse({ type: DashboardDto })
  overview(
    @Req() req: AuthenticatedRequest,
    @Query() q: FinancialReportQueryDto,
  ) {
    return this.data.dashboard(req.authUser!, q)
  }
}
@ApiTags('Activity / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Current staff bearer required' })
@ApiForbiddenResponse({ description: 'activity.view required' })
@ApiBadRequestResponse({ description: 'Invalid window/filter/pagination' })
@ApiServiceUnavailableResponse({
  description: 'Database/query budget unavailable',
})
@Controller('admin/activity')
@UseGuards(AccessGuard, AdminGuard, ReportsGuard)
export class ActivityController {
  constructor(private readonly data: ReportingDataService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ReportAccess('activity.view')
  @ApiOkResponse({ type: ActivityPageDto })
  list(@Query() q: ActivityQueryDto) {
    return this.data.activity(q)
  }
}
