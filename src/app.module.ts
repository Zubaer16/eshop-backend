import { JobsModule } from './jobs/jobs.module'
import { ReportingModule } from './reporting/reporting.module'
import { PushModule } from './push/push.module'
import { EmailModule } from './email/email.module'
import { NotificationsModule } from './notifications/notifications.module'
import { Module } from '@nestjs/common'
import { MerchandisingModule } from './merchandising/merchandising.module'
import { PromotionsModule } from './promotions/promotions.module'
import { ConfigModule } from '@nestjs/config'
import { validateEnvironment } from './config/environment'
import { HealthModule } from './health/health.module'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './auth/auth.module'
import { CatalogModule } from './catalog/catalog.module'
import { InventoryModule } from './inventory/inventory.module'
import { MediaModule } from './media/media.module'
import { CheckoutModule } from './checkout/checkout.module'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { WishlistModule } from './wishlist/wishlist.module'
import { AccountModule } from './account/account.module'
import { CustomersModule } from './customers/customers.module'
import { StoreProfileModule } from './store-profile/store-profile.module'
import { StoreContentModule } from './store-content/store-content.module'
import { StoreBrandingModule } from './store-branding/store-branding.module'
import { StoreBootstrapModule } from './store-bootstrap/store-bootstrap.module'
import { StoreOperationsModule } from './store-operations/store-operations.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule,
    PromotionsModule,
    MerchandisingModule,
    NotificationsModule,
    EmailModule,
    PushModule,
    ReportingModule,
    JobsModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    MediaModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    WishlistModule,
    AccountModule,
    CustomersModule,
    StoreProfileModule,
    StoreContentModule,
    StoreBrandingModule,
    StoreBootstrapModule,
    StoreOperationsModule,
  ],
})
export class AppModule {}
