import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  MerchandisingAdminController,
  MerchandisingPublicController,
} from './merchandising.controller'
import { MerchandisingManageGuard } from './merchandising.guard'
import { MerchandisingService } from './merchandising.service'

@Module({
  imports: [AuthModule],
  controllers: [MerchandisingAdminController, MerchandisingPublicController],
  providers: [MerchandisingManageGuard, MerchandisingService],
})
export class MerchandisingModule {}
