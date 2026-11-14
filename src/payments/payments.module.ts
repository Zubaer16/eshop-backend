import { CheckoutModule } from '../checkout/checkout.module'
import { OrdersModule } from '../orders/orders.module'
import { HostedCheckoutController } from './hosted-checkout.controller'
import { HostedCheckoutService } from './hosted-checkout.service'
import { StripeCheckoutGateway } from './providers/stripe-checkout-gateway'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerGuard } from '../auth/customer.guard'
import {
  PaymentCustomerController,
  PaymentWebhookController,
} from './payments.controller'
import { PaymentsService } from './payments.service'
import { StripeTestGateway } from './providers/stripe-gateway'
import { PaymentSettlementService } from './payment-settlement.service'
import { PaymentCancellationService } from './payment-cancellation.service'
import { PaymentTestCompletionService } from './payment-test-completion.service'
import { RefundLedgerService } from './refunds/refund-ledger.service'
import { RefundExecutionService } from './refunds/refund-execution.service'
import {
  RefundLedgerOwnerController,
  RefundLedgerCustomerController,
} from './refunds/refund-ledger.controller'

@Module({
  imports: [AuthModule, CheckoutModule, OrdersModule],
  controllers: [
    HostedCheckoutController,
    PaymentCustomerController,
    PaymentWebhookController,
    RefundLedgerOwnerController,
    RefundLedgerCustomerController,
  ],
  providers: [
    HostedCheckoutService,
    StripeCheckoutGateway,
    PaymentsService,
    StripeTestGateway,
    PaymentSettlementService,
    PaymentCancellationService,
    PaymentTestCompletionService,
    RefundLedgerService,
    RefundExecutionService,
    CustomerGuard,
  ],
  exports: [
    PaymentSettlementService,
    PaymentCancellationService,
    RefundExecutionService,
  ],
})
export class PaymentsModule {}
