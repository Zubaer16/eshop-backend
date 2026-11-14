import { Module } from '@nestjs/common'
import { PromotionsModule } from '../promotions/promotions.module'
import { AuthModule } from '../auth/auth.module'
import {
  CheckoutCustomerController,
  CheckoutAdminController,
} from './checkout.controller'
import { CheckoutService } from './checkout.service'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import { ReservationService } from './reservation.service'
import { CustomerGuard } from '../auth/customer.guard'
import { DeliveryZonesAdminController } from './delivery-zones.controller'
import { DeliveryZonesService } from './delivery-zones.service'

@Module({
  imports: [AuthModule, PromotionsModule],
  controllers: [
    CheckoutCustomerController,
    CheckoutAdminController,
    DeliveryZonesAdminController,
  ],
  providers: [
    CheckoutService,
    ReservationService,
    CheckoutOwnerGuard,
    CustomerGuard,
    DeliveryZonesService,
  ],
  exports: [ReservationService],
})
export class CheckoutModule {}
