import { Module } from "@nestjs/common";
import { BookingController } from "./booking.controller.js";
import { BookingService } from "./booking.service.js";
import { NoopPaymentGateway, PaymentGateway } from "./payment-gateway.js";

@Module({
  controllers: [BookingController],
  providers: [
    BookingService,
    // Phase 5 swaps this for the Stripe adapter; nothing else changes.
    { provide: PaymentGateway, useClass: NoopPaymentGateway },
  ],
  exports: [BookingService, PaymentGateway],
})
export class BookingModule {}
