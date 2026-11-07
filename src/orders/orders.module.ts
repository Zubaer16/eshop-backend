import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { OrdersCustomerController } from './orders.controller'
import { OrdersService } from './orders.service'
import { FulfillmentAdminController } from './fulfillment/fulfillment.controller'
import { FulfillmentService } from './fulfillment/fulfillment.service'
import { FulfillmentManageGuard } from './fulfillment/fulfillment.guard'
import {
  ReturnsCustomerController,
  ReturnsAdminController,
} from './returns/returns.controller'
import { ReturnsService } from './returns/returns.service'
import { ReplacementsService } from './replacements/replacements.service'
import { TrackingService } from './tracking/tracking.service'
import {
  TrackingAdminController,
  TrackingCustomerController,
} from './tracking/tracking.controller'
import {
  ReplacementsAdminController,
  ReplacementsCustomerController,
} from './replacements/replacements.controller'

@Module({
  imports: [AuthModule],
  controllers: [
    OrdersCustomerController,
    FulfillmentAdminController,
    ReturnsCustomerController,
    ReturnsAdminController,
    ReplacementsAdminController,
    ReplacementsCustomerController,
    TrackingCustomerController,
    TrackingAdminController,
  ],
  providers: [
    OrdersService,
    CustomerCartGuard,
    FulfillmentService,
    FulfillmentManageGuard,
    ReturnsService,
    ReplacementsService,
    TrackingService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
