"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "cn";
import { toggleSeat, type SeatStatus, type SeatType } from "@/lib/seat";
import { seatLabelsTh, type SeatLabels } from "./labels";
import { Seat } from "./seat";

export interface SeatMapSeat {
  id: string;
  /** Row letter, e.g. "A". */
  row: string;
  number: number;
  type: SeatType;
  status: SeatStatus;
  priceBaht: number;
  /** 0-based grid position (as in the API contract). Missing columns render as aisles. */
  gridRow: number;
  gridCol: number;
}

export interface SeatMapProps {
  seats: readonly SeatMapSeat[];
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  onRejected?: (reason: "limit" | "unavailable") => void;
  /** Seats that were just taken by someone else (flash red). */
  justTakenIds?: readonly string[];
  maxSeats?: number;
  labels?: SeatLabels;
  /** Accessible name of the map. */
  ariaLabel?: string;
  className?: string;
}

/** CSS grid cell of a seat: columns 1 and last hold the row labels, so seats start at column 2. */
export function seatGridPlacement(seat: Pick<SeatMapSeat, "gridRow" | "gridCol">) {
  return { gridRow: seat.gridRow + 1, gridColumn: seat.gridCol + 2 };
}

type Direction = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function isDirection(key: string): key is Direction {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/** Nearest seat from `from` in the arrow direction; left/right stay in the row, up/down prefer the same column. */
function neighbour(
  seats: readonly SeatMapSeat[],
  from: SeatMapSeat,
  key: Direction,
): SeatMapSeat | undefined {
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  let best: SeatMapSeat | undefined;
  let bestScore = Infinity;
  for (const seat of seats) {
    const along = horizontal ? seat.gridCol - from.gridCol : seat.gridRow - from.gridRow;
    const across = horizontal ? seat.gridRow - from.gridRow : seat.gridCol - from.gridCol;
    if (along * sign <= 0) continue;
    if (horizontal && across !== 0) continue;
    const score = Math.abs(along) * 100 + Math.abs(across);
    if (score < bestScore) {
      best = seat;
      bestScore = score;
    }
  }
  return best;
}

/** Seat grid with row labels, aisles, horizontal scroll and roving-tabindex keyboard navigation. */
export function SeatMap({
  seats,
  selectedIds,
  onSelectionChange,
  onRejected,
  justTakenIds = [],
  maxSeats,
  labels = seatLabelsTh,
  ariaLabel = "แผนผังที่นั่ง",
  className,
}: SeatMapProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);

  const columns = Math.max(1, ...seats.map((s) => s.gridCol + 1));
  const rows = new Map<number, string>();
  for (const s of seats) rows.set(s.gridRow + 1, s.row);
  const activeId =
    focusedId && seats.some((s) => s.id === focusedId) ? focusedId : (seats[0]?.id ?? "");

  function handleToggle(seat: SeatMapSeat) {
    const result = toggleSeat(selectedIds, seat.id, seat.status, maxSeats);
    if (result.rejected) onRejected?.(result.rejected);
    else onSelectionChange(result.selection);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isDirection(event.key)) return;
    const current = seats.find((s) => s.id === activeId);
    if (!current) return;
    event.preventDefault();
    const next = neighbour(seats, current, event.key);
    if (!next) return;
    setFocusedId(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div className={cn("w-full overflow-x-auto pb-2", className)} data-slot="seat-map">
      <div
        role="group"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className="mx-auto grid w-max gap-1 px-2"
        style={{ gridTemplateColumns: `repeat(${columns + 2}, 2rem)` }}
      >
        {[...rows.entries()].flatMap(([gridRow, row]) =>
          [1, columns + 2].map((column) => (
            <span
              key={`${gridRow}-${column}`}
              aria-hidden
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ gridRow, gridColumn: column }}
            >
              {row}
            </span>
          )),
        )}
        {seats.map((seat) => (
          <Seat
            key={seat.id}
            ref={(node) => {
              if (node) refs.current.set(seat.id, node);
              else refs.current.delete(seat.id);
            }}
            data-seat-id={seat.id}
            style={seatGridPlacement(seat)}
            label={`${seat.row}${seat.number}`}
            type={seat.type}
            status={seat.status}
            priceBaht={seat.priceBaht}
            selected={selectedIds.includes(seat.id)}
            justTaken={justTakenIds.includes(seat.id)}
            labels={labels}
            tabIndex={seat.id === activeId ? 0 : -1}
            onFocus={() => {
              setFocusedId(seat.id);
            }}
            onToggle={() => {
              handleToggle(seat);
            }}
          />
        ))}
      </div>
    </div>
  );
}
