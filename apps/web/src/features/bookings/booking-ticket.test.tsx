import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/api/generated/model";
import { renderWithIntl } from "@/test/intl";
import { BookingTicket } from "./booking-ticket";
import { groupByMonth, TicketStub } from "./bookings-view";
import { ticketState } from "./ticket-parts";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeBooking(
  overrides: Partial<Booking> = {},
  startsAt = "2099-11-03T22:00:00+07:00",
): Booking {
  return {
    id: "b1",
    bookingCode: "MT-U78N2K",
    status: "CONFIRMED",
    cancelReason: null,
    showtime: {
      id: "s1",
      startsAt,
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
        name: { th: "มูนไรส์ ซีนีเพล็กซ์ สุขุมวิท", en: "Moonrise Cineplex Sukhumvit" },
        address: { th: "x", en: "x" },
        city: "Bangkok",
      },
    },
    seats: [
      { seatId: "1", label: "G6", type: "STANDARD", priceBaht: 290 },
      { seatId: "2", label: "G7", type: "STANDARD", priceBaht: 290 },
    ],
    totalBaht: 580,
    currency: "THB",
    paymentExpiresAt: "2026-11-03T10:05:00Z",
    holdExpiresAt: "2026-11-03T10:06:00Z",
    ticketQr: "MT-U78N2K.signature",
    createdAt: "2026-11-03T10:00:00Z",
    ...overrides,
  };
}

describe("ticketState", () => {
  const start = Date.parse("2026-11-03T22:00:00+07:00");
  const booking = makeBooking({}, "2026-11-03T22:00:00+07:00");

  it("is valid until the movie ends, then screened", () => {
    expect(ticketState(booking, start + 119 * 60_000)).toBe("valid");
    expect(ticketState(booking, start + 120 * 60_000)).toBe("screened");
  });

  it("cancelled and unpaid bookings are never valid", () => {
    expect(ticketState(makeBooking({ status: "CANCELLED" }), start)).toBe("cancelled");
    expect(ticketState(makeBooking({ status: "PENDING_PAYMENT" }), start)).toBe("pending");
  });
});

describe("groupByMonth", () => {
  it("groups consecutive bookings by their Bangkok month, keeping the order", () => {
    const groups = groupByMonth(
      [
        makeBooking({ id: "a" }, "2026-11-20T19:00:00+07:00"),
        makeBooking({ id: "b" }, "2026-11-01T00:30:00+07:00"),
        // 31 Oct 18:00 UTC is 1 Nov in Bangkok.
        makeBooking({ id: "c" }, "2026-10-31T18:00:00Z"),
        makeBooking({ id: "d" }, "2026-10-12T19:00:00+07:00"),
      ],
      "en",
    );
    expect(groups.map((g) => [g.label, g.bookings.map((b) => b.id)])).toEqual([
      ["November 2026", ["a", "b", "c"]],
      ["October 2026", ["d"]],
    ]);
  });
});

describe("BookingTicket", () => {
  it("shows a valid ticket: title, time, hall, seats, total, QR and code", () => {
    renderWithIntl(<BookingTicket booking={makeBooking()} />);
    const ticket = screen.getByRole("article", { name: "Movie ticket" });
    expect(within(ticket).getByRole("heading", { name: "Street Fighter" })).toBeInTheDocument();
    expect(within(ticket).getByText("22:00")).toBeInTheDocument();
    expect(within(ticket).getByText("2 seats", { exact: false })).toBeInTheDocument();
    expect(within(ticket).getByText("G6")).toBeInTheDocument();
    expect(within(ticket).getByText("G7")).toBeInTheDocument();
    expect(within(ticket).getByText("MT-U78N2K")).toBeInTheDocument();
    expect(within(ticket).getByRole("img", { name: /Ticket QR code/ })).toBeInTheDocument();
    expect(within(ticket).getByRole("button", { name: "Add to calendar" })).toBeInTheDocument();
    expect(within(ticket).queryByText("Cancelled")).not.toBeInTheDocument();
  });

  it("says 1 seat for a single seat", () => {
    const one = makeBooking();
    renderWithIntl(<BookingTicket booking={{ ...one, seats: one.seats.slice(0, 1) }} />);
    expect(screen.getByText("1 seat", { exact: false })).toBeInTheDocument();
  });

  it("stamps a cancelled ticket and shows no QR", () => {
    renderWithIntl(
      <BookingTicket booking={makeBooking({ status: "CANCELLED", ticketQr: null })} />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Ticket QR code/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to calendar" })).not.toBeInTheDocument();
  });

  it("keeps a screened ticket as history: stamped, no calendar button", () => {
    renderWithIntl(<BookingTicket booking={makeBooking({}, "2020-01-01T19:00:00+07:00")} />);
    expect(screen.getByText("Screened")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to calendar" })).not.toBeInTheDocument();
  });

  it("renders in Thai", () => {
    renderWithIntl(<BookingTicket booking={makeBooking()} />, "th");
    expect(screen.getByRole("heading", { name: "สตรีทไฟเตอร์" })).toBeInTheDocument();
    expect(screen.getByText("2 ที่นั่ง", { exact: false })).toBeInTheDocument();
  });
});

describe("TicketStub", () => {
  it("is one link to the ticket, with the time and seats on it", () => {
    renderWithIntl(
      <ul>
        <TicketStub booking={makeBooking()} now={Date.parse("2026-11-03T12:00:00Z")} />
      </ul>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining("/booking?id=b1"));
    expect(within(link).getByText("22:00")).toBeInTheDocument();
    expect(within(link).getByText("G6")).toBeInTheDocument();
    expect(within(link).getByText("Confirmed")).toBeInTheDocument();
  });

  it("stamps cancelled and screened stubs", () => {
    const now = Date.parse("2099-12-31T00:00:00Z");
    renderWithIntl(
      <ul>
        <TicketStub booking={makeBooking({ id: "x", status: "CANCELLED" })} now={now} />
        <TicketStub booking={makeBooking({ id: "y" })} now={now} />
      </ul>,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Screened")).toBeInTheDocument();
  });
});
