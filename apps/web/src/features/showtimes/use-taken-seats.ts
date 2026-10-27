import { useEffect, useRef } from "react";
import type { SeatMap } from "@/api/generated/model";
import { findTakenSeats, type SeatStatus } from "@/lib/seat";

/** The seat map is polled this often while the tab is visible (plan §6). */
export const SEAT_POLL_MS = 10_000;

/** Labels of selected seats that the given seat map shows as no longer available. */
export function takenSelectedLabels(seatMap: SeatMap, selectedLabels: readonly string[]): string[] {
  const idByLabel = new Map(seatMap.seats.map((s) => [s.label, s.id]));
  const statusById = new Map<string, SeatStatus>(seatMap.seats.map((s) => [s.id, s.status]));
  const selectedIds = selectedLabels.flatMap((label) => idByLabel.get(label) ?? []);
  const takenIds = new Set(findTakenSeats(selectedIds, statusById));
  return selectedLabels.filter((label) => {
    const id = idByLabel.get(label);
    return id !== undefined && takenIds.has(id);
  });
}

/**
 * "Seat just taken" detection (plan §6): after every new seat map, selected seats that are no longer
 * available are reported once via `onTaken`. The caller removes them from the selection and the URL.
 */
export function useTakenSeatDetector(
  seatMap: SeatMap | undefined,
  selectedLabels: readonly string[],
  onTaken: (labels: string[]) => void,
): void {
  const onTakenRef = useRef(onTaken);
  const selectedRef = useRef(selectedLabels);
  useEffect(() => {
    onTakenRef.current = onTaken;
    selectedRef.current = selectedLabels;
  });

  const generatedAt = seatMap?.generatedAt;
  useEffect(() => {
    if (!seatMap) return;
    const taken = takenSelectedLabels(seatMap, selectedRef.current);
    if (taken.length > 0) onTakenRef.current(taken);
    // Only a new seat map (a new `generatedAt`) triggers detection, not selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedAt]);
}
