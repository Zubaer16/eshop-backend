import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerGuard } from '../auth/customer.guard'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, CustomerGuard],
})
export class AccountModule {}
