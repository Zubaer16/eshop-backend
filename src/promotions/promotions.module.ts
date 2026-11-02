import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  PromotionsAdminController,
  PromotionsPublicController,
} from './promotions.controller'
import { PromotionsManageGuard } from './promotions.guard'
import { PromotionsService } from './promotions.service'

@Module({
  imports: [AuthModule],
  controllers: [PromotionsAdminController, PromotionsPublicController],
  providers: [PromotionsService, PromotionsManageGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
