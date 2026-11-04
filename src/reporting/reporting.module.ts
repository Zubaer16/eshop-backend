import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  ActivityController,
  DashboardController,
  ReportsController,
} from './reporting.controller'
import { ReportingDataService } from './reporting-data.service'
import { ReportingExportService } from './reporting-export.service'
import { ReportsGuard } from './reporting.guard'
@Module({
  imports: [AuthModule],
  controllers: [ReportsController, DashboardController, ActivityController],
  providers: [ReportingDataService, ReportingExportService, ReportsGuard],
})
export class ReportingModule {}
