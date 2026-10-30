import { Module } from "@nestjs/common";
import { PaymentGateway } from "../booking/payment-gateway.js";
import { ConfigService } from "../config/config.service.js";
import { FakePaymentProvider } from "./fake.provider.js";
import { PaymentProvider } from "./payment-provider.js";
import { DemoPaymentsController, PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { ProviderPaymentGateway } from "./provider-payment-gateway.js";
import { StripePaymentProvider } from "./stripe.provider.js";

/** Stripe when PAYMENTS_PROVIDER=stripe, otherwise the in-process fake (development, test, explicit demo deploys). */
export function createPaymentProvider(config: ConfigService): PaymentProvider {
  if (config.get("PAYMENTS_PROVIDER") !== "stripe") return new FakePaymentProvider();
  const secret = config.get("STRIPE_SECRET_KEY");
  const publishable = config.get("STRIPE_PUBLISHABLE_KEY");
  const webhook = config.get("STRIPE_WEBHOOK_SECRET");
  // Env validation already requires all three; this keeps the types honest.
  if (!secret || !publishable || !webhook) throw new Error("Stripe keys are missing");
  return new StripePaymentProvider(secret, publishable, webhook);
}

/** The provider and the booking module's PaymentGateway port built on it. */
@Module({
  providers: [
    { provide: PaymentProvider, inject: [ConfigService], useFactory: createPaymentProvider },
    { provide: PaymentGateway, useClass: ProviderPaymentGateway },
  ],
  exports: [PaymentProvider, PaymentGateway],
})
export class PaymentProviderModule {}

/**
 * HTTP side: createPaymentIntent, the webhook, and the demo pay endpoint (answers 404 unless the provider is the
 * fake, see PaymentsService.demoPay).
 */
@Module({
  imports: [PaymentProviderModule],
  controllers: [PaymentsController, DemoPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
