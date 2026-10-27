/** Mirrors the API contract (`SeatStatus`, `SeatType`). Replaced by orval types once the client is generated. */
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";
export type SeatType = "STANDARD" | "PREMIUM";

export const MAX_SEATS_PER_BOOKING = 4;

export function isSelectable(status: SeatStatus): boolean {
  return status === "AVAILABLE";
}

export interface ToggleResult {
  selection: string[];
  /** Why the toggle was refused, if it was. */
  rejected: "limit" | "unavailable" | null;
}

/**
 * Adds or removes a seat from the selection, keeping selection order.
 * Deselecting is always allowed. Selecting respects availability and the 4-seat limit.
 */
export function toggleSeat(
  selection: readonly string[],
  seatId: string,
  status: SeatStatus,
  max: number = MAX_SEATS_PER_BOOKING,
): ToggleResult {
  if (selection.includes(seatId)) {
    return { selection: selection.filter((id) => id !== seatId), rejected: null };
  }
  if (!isSelectable(status)) return { selection: [...selection], rejected: "unavailable" };
  if (selection.length >= max) return { selection: [...selection], rejected: "limit" };
  return { selection: [...selection, seatId], rejected: null };
}

/**
 * Seats in the selection that the latest seat map shows as no longer available.
 * Drives the "seat just taken" UX after each poll.
 */
export function findTakenSeats(
  selection: readonly string[],
  statusById: ReadonlyMap<string, SeatStatus>,
): string[] {
  return selection.filter((id) => {
    const status = statusById.get(id);
    return status !== undefined && !isSelectable(status);
  });
}
