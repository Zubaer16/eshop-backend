import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  AdminStoreOperationsController,
  PublicStoreOperationsController,
} from './store-operations.controller'
import { StoreOperationsService } from './store-operations.service'

@Module({
  imports: [AuthModule],
  controllers: [
    AdminStoreOperationsController,
    PublicStoreOperationsController,
  ],
  providers: [StoreOperationsService],
  exports: [StoreOperationsService],
})
export class StoreOperationsModule {}
