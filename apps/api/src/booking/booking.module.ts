import { Module } from "@nestjs/common";
import { PaymentProviderModule } from "../payments/payments.module.js";
import { BookingController } from "./booking.controller.js";
import { BookingExpiryService } from "./booking-expiry.service.js";
import { BookingService } from "./booking.service.js";

@Module({
  // PaymentGateway comes from the payments module (Stripe or the fake provider).
  imports: [PaymentProviderModule],
  controllers: [BookingController],
  providers: [BookingService, BookingExpiryService],
  exports: [BookingService, BookingExpiryService],
})
export class BookingModule {}
