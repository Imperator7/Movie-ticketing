import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/api/generated/model";
import { renderWithIntl } from "@/test/intl";
import { CheckoutBody, type CheckoutBodyProps } from "./checkout-body";
import type { PaymentMethodPanelProps } from "./payment-method-panel";

const booking: Booking = {
  id: "b1",
  bookingCode: "MT-7KQ2XP",
  status: "PENDING_PAYMENT",
  cancelReason: null,
  showtime: {
    id: "s1",
    startsAt: "2026-10-28T19:30:00+07:00",
    format: "TWO_D",
    hallNumber: 1,
    movie: {
      slug: "last-orbit",
      title: { th: "วงโคจรสุดท้าย", en: "The Last Orbit" },
      posterUrl: null,
      rating: "AGE_13",
      durationMin: 148,
    },
    cinema: {
      id: "c1",
      name: { th: "โรงภาพยนตร์ สยาม", en: "Siam Cinema" },
      address: { th: "x", en: "x" },
      city: "Bangkok",
    },
  },
  seats: [
    { seatId: "1", label: "A5", type: "STANDARD", priceBaht: 220 },
    { seatId: "2", label: "A6", type: "STANDARD", priceBaht: 220 },
  ],
  totalBaht: 440,
  currency: "THB",
  paymentExpiresAt: "2026-10-28T10:05:00Z",
  holdExpiresAt: "2026-10-28T10:06:00Z",
  createdAt: "2026-10-28T10:00:00Z",
  ticketQr: null,
};

function FakePanel({ disabled, amountBaht, onSubmitted }: PaymentMethodPanelProps) {
  return (
    <button type="button" disabled={disabled} onClick={onSubmitted}>
      Fake pay {amountBaht}
    </button>
  );
}

function setup(overrides: Partial<CheckoutBodyProps> = {}) {
  const handlers = {
    onConfirmCancel: vi.fn(),
    onConfirmLeave: vi.fn(),
    onKeepBooking: vi.fn(),
    onTimeUpContinue: vi.fn(),
    onPaymentSubmitted: vi.fn(),
    onViewResult: vi.fn(),
  };
  renderWithIntl(
    <CheckoutBody
      booking={booking}
      msLeft={252_000}
      locale="en"
      PaymentPanel={FakePanel}
      leaveOpen={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("CheckoutBody: pending", () => {
  it("shows the summary, the 4:12 countdown and an enabled payment panel", async () => {
    const handlers = setup();
    expect(screen.getByText("The Last Orbit")).toBeInTheDocument();
    expect(screen.getByText("A5, A6")).toBeInTheDocument();
    expect(screen.getByText("฿440")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("4:12");
    const pay = screen.getByRole("button", { name: "Fake pay 440" });
    expect(pay).toBeEnabled();
    await userEvent.click(pay);
    expect(handlers.onPaymentSubmitted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks for confirmation before cancelling", async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancel this booking?");
    expect(handlers.onConfirmCancel).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(handlers.onConfirmCancel).toHaveBeenCalledTimes(1);
  });

  it("announces the last minute to screen readers", () => {
    setup({ msLeft: 60_000 });
    expect(screen.getByRole("timer")).toHaveAttribute("data-tone", "warning");
    expect(
      screen.getAllByRole("status").some((el) => el.textContent === "One minute left to pay"),
    ).toBe(true);
  });

  it("shows the 'going back will cancel this booking' dialog and confirms", async () => {
    const handlers = setup({ leaveOpen: true });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Going back will cancel this booking");
    await userEvent.click(screen.getByRole("button", { name: "Cancel and go back" }));
    expect(handlers.onConfirmLeave).toHaveBeenCalledTimes(1);
  });

  it("keeps the booking when the user dismisses the leave dialog", async () => {
    const handlers = setup({ leaveOpen: true });
    await userEvent.click(await screen.findByRole("button", { name: "Keep booking" }));
    expect(handlers.onKeepBooking).toHaveBeenCalled();
  });
});

describe("CheckoutBody: time's up", () => {
  it("opens a blocking dialog at 0:00, disables payment and returns to the seat map", async () => {
    const handlers = setup({ msLeft: 0 });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Time's up");
    // The dialog makes the page behind it inert for assistive tech, hence `hidden: true`.
    const timer = screen.getByRole("timer", { hidden: true });
    expect(timer).toHaveAttribute("data-tone", "expired");
    expect(timer).toHaveTextContent("0:00");
    expect(screen.getByRole("button", { name: /Fake pay/, hidden: true })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to seat selection" }));
    expect(handlers.onTimeUpContinue).toHaveBeenCalledTimes(1);
  });
});

describe("CheckoutBody: booking no longer pending", () => {
  it("shows a notice and a way to the result instead of the payment panel", async () => {
    const handlers = setup({
      booking: { ...booking, status: "CANCELLED", cancelReason: "PAYMENT_TIMEOUT" },
      msLeft: 0,
    });
    expect(screen.getByText("This booking is no longer waiting for payment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fake pay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View booking" }));
    expect(handlers.onViewResult).toHaveBeenCalledTimes(1);
  });
});
