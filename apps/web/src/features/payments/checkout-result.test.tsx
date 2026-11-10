import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Booking, CancelReason } from "@/api/generated/model";
import { renderWithIntl } from "@/test/intl";
import { CheckoutResult } from "./checkout-complete-view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function cancelled(cancelReason: CancelReason): Booking {
  return {
    id: "b1",
    bookingCode: "MT-U78N2K",
    status: "CANCELLED",
    cancelReason,
    showtime: {
      id: "s1",
      startsAt: "2099-11-03T22:00:00+07:00",
      format: "TWO_D",
      hallNumber: 2,
      movie: {
        slug: "street-fighter",
        title: { th: "สตรีทไฟเตอร์", en: "Street Fighter" },
        posterUrl: null,
        rating: "AGE_15",
        durationMin: 120,
      },
      cinema: {
        id: "c1",
        name: { th: "มูนไรส์", en: "Moonrise" },
        address: { th: "x", en: "x" },
        city: "Bangkok",
      },
    },
    seats: [{ seatId: "1", label: "G6", type: "STANDARD", priceBaht: 290 }],
    totalBaht: 290,
    currency: "THB",
    paymentExpiresAt: "2026-11-03T10:05:00Z",
    holdExpiresAt: "2026-11-03T10:06:00Z",
    ticketQr: null,
    createdAt: "2026-11-03T10:00:00Z",
  };
}

describe("CheckoutResult for a cancelled booking", () => {
  it.each<[CancelReason, RegExp]>([
    ["AMOUNT_MISMATCH_REFUNDED", /refunded you in full/],
    ["LATE_PAYMENT_REFUNDED", /after the time limit and has been refunded/],
    ["PAYMENT_TIMEOUT", /payment time ran out/],
  ])("%s shows its own message", (reason, text) => {
    renderWithIntl(<CheckoutResult booking={cancelled(reason)} />, "en");
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it("tells a Thai customer the amount-mismatch payment was refunded", () => {
    renderWithIntl(<CheckoutResult booking={cancelled("AMOUNT_MISMATCH_REFUNDED")} />, "th");
    expect(screen.getByRole("alert")).toHaveTextContent("คืนเงินให้คุณเต็มจำนวน");
  });
});
