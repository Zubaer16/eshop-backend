import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerGuard } from '../auth/customer.guard'
import { WishlistController } from './wishlist.controller'
import { WishlistService } from './wishlist.service'

@Module({
  imports: [AuthModule],
  controllers: [WishlistController],
  providers: [WishlistService, CustomerGuard],
})
export class WishlistModule {}
