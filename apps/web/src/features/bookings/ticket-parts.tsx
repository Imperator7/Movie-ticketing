import type { ReactNode } from "react";
import type { Booking } from "@/api/generated/model";
import { cn } from "@/lib/utils";

/**
 * What a ticket shows:
 * - valid: confirmed and not screened yet (QR is the entry pass),
 * - screened: confirmed and the movie is over (kept as history),
 * - cancelled / pending: not a usable ticket.
 */
export type TicketState = "valid" | "screened" | "cancelled" | "pending";

export function ticketState(booking: Booking, now: number): TicketState {
  if (booking.status === "CANCELLED") return "cancelled";
  if (booking.status === "PENDING_PAYMENT") return "pending";
  const endsAt =
    new Date(booking.showtime.startsAt).getTime() + booking.showtime.movie.durationMin * 60_000;
  return endsAt <= now ? "screened" : "valid";
}

export const FORMAT_LABEL = { TWO_D: "2D", THREE_D: "3D", IMAX: "IMAX" } as const;

/**
 * The tear line between the ticket and its stub: a dashed rule with a round notch cut on each side.
 * The notches are page-coloured circles, so the ticket must sit on `bg-background`.
 */
export function Perforation({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  if (orientation === "vertical") {
    return (
      <div aria-hidden className="relative w-0 shrink-0 border-l-2 border-dashed border-border">
        <span className="absolute -top-3 -left-[13px] size-6 rounded-full bg-background" />
        <span className="absolute -bottom-3 -left-[13px] size-6 rounded-full bg-background" />
      </div>
    );
  }
  return (
    <div aria-hidden className="relative h-0 border-t-2 border-dashed border-border">
      <span className="absolute -top-[13px] -left-3 size-6 rounded-full bg-background" />
      <span className="absolute -top-[13px] -right-3 size-6 rounded-full bg-background" />
    </div>
  );
}

const STAMP_TONE: Record<Exclude<TicketState, "valid">, string> = {
  cancelled: "border-destructive text-destructive",
  pending: "border-warning text-warning",
  screened: "border-muted-foreground text-muted-foreground",
};

/** A rubber stamp across a ticket that can't be used to get in (cancelled, unpaid, already screened). */
export function TicketStamp({
  state,
  className,
  children,
}: {
  state: Exclude<TicketState, "valid">;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none inline-block -rotate-12 rounded-md border-2 bg-card/80 px-2.5 py-1 font-heading text-sm font-bold tracking-wider uppercase",
        STAMP_TONE[state],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Seat labels as little chips, like the seat row printed on a paper ticket. */
export function SeatChips({
  labels,
  className,
}: {
  labels: readonly string[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-md border border-gold/60 bg-gold/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}
