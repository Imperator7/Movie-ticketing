"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { toggleSeat, type SeatStatus, type SeatType } from "@/lib/seat";
import { seatLabelsTh, type SeatLabels } from "./labels";
import { Seat } from "./seat";
import { isNavKey, nextSeat } from "./seat-nav";
import {
  anchoredScroll,
  defaultZoom,
  distanceBetween,
  pinchScale,
  zoomReducer,
} from "./seat-map-zoom";

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
  /** Our seats while Buy is in flight. */
  pendingIds?: readonly string[];
  /** Ignores taps and marks the map busy (e.g. while a booking is being created). */
  disabled?: boolean;
  maxSeats?: number;
  labels?: SeatLabels;
  /** Accessible name of the map. */
  ariaLabel?: string;
  /** The + / − / reset buttons (the non-gesture way to zoom). */
  showZoomControls?: boolean;
  className?: string;
}

/** CSS grid cell of a seat: columns 1 and last hold the row labels, so seats start at column 2. */
export function seatGridPlacement(seat: Pick<SeatMapSeat, "gridRow" | "gridCol">) {
  return { gridRow: seat.gridRow + 1, gridColumn: seat.gridCol + 2 };
}

const CELL_PX = 32;
const GAP_PX = 4;
const PADDING_PX = 16;

/** Natural width of the grid (seat cells, gaps, padding) before zoom. */
export function naturalMapWidth(columns: number): number {
  const cells = columns + 2;
  return cells * CELL_PX + (cells - 1) * GAP_PX + PADDING_PX;
}

/**
 * Seat grid with row labels, aisles and keyboard + touch support:
 * - one tab stop (roving tabindex); arrows, Home/End, PageUp/Down move between seats, Enter/Space toggles;
 * - a live region announces selection changes and the seat limit;
 * - pinch to zoom and drag to pan on touch (native scroll), + / − / reset buttons everywhere.
 */
export function SeatMap({
  seats,
  selectedIds,
  onSelectionChange,
  onRejected,
  justTakenIds = [],
  pendingIds = [],
  disabled = false,
  maxSeats,
  labels = seatLabelsTh,
  ariaLabel = "แผนผังที่นั่ง",
  showZoomControls = true,
  className,
}: SeatMapProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [scale, dispatchZoom] = useReducer(zoomReducer, 1);
  const userZoomed = useRef(false);

  const columns = Math.max(1, ...seats.map((s) => s.gridCol + 1));
  const rows = new Map<number, string>();
  for (const s of seats) rows.set(s.gridRow + 1, s.row);
  const activeId =
    focusedId && seats.some((s) => s.id === focusedId) ? focusedId : (seats[0]?.id ?? "");
  const maxSelected = maxSeats ?? 4;

  // On a narrow screen start a bit smaller than 100% (never below 80%), until the user zooms.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (userZoomed.current) return;
      dispatchZoom({
        type: "reset",
        to: defaultZoom(el.clientWidth, naturalMapWidth(columns)),
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [columns]);

  function zoomTo(action: Parameters<typeof zoomReducer>[1]) {
    userZoomed.current = true;
    dispatchZoom(action);
  }

  function handleToggle(seat: SeatMapSeat) {
    if (disabled) return;
    const result = toggleSeat(selectedIds, seat.id, seat.status, maxSeats);
    const name = labels.seatName(seat.row, seat.number);
    if (result.rejected) {
      if (result.rejected === "limit") setAnnouncement(labels.announce.limit(maxSelected));
      onRejected?.(result.rejected);
      return;
    }
    setAnnouncement(
      result.selection.length > selectedIds.length
        ? labels.announce.selected(name, result.selection.length, maxSelected)
        : labels.announce.deselected(name, result.selection.length),
    );
    onSelectionChange(result.selection);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo({ type: "in" });
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomTo({ type: "out" });
      return;
    }
    if (!isNavKey(event.key)) return;
    event.preventDefault();
    // Navigate from the seat that actually has focus (state may lag behind fast key repeat).
    const from =
      event.target instanceof Element
        ? (event.target.closest("[data-seat-id]")?.getAttribute("data-seat-id") ?? activeId)
        : activeId;
    const next = nextSeat(seats, from, event.key, event.ctrlKey || event.metaKey);
    if (!next) return;
    setFocusedId(next.id);
    refs.current.get(next.id)?.focus();
  }

  // ---- pinch: two pointers; a single finger is left to the browser (native pan/scroll)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) pinch.current = { distance: distanceBetween(a, b), scale };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = pinch.current;
    const el = scroller.current;
    if (!start || !el || pointers.current.size !== 2) return;
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const next = pinchScale(start.scale, start.distance, distanceBetween(a, b));
    if (next === scale) return;
    const box = el.getBoundingClientRect();
    const anchorX = (a.x + b.x) / 2 - box.left;
    const anchorY = (a.y + b.y) / 2 - box.top;
    const left = anchoredScroll(el.scrollLeft, anchorX, scale, next);
    const top = anchoredScroll(el.scrollTop, anchorY, scale, next);
    zoomTo({ type: "set", value: next });
    // The new size applies on the next frame; scroll after it so the pinch centre stays put.
    requestAnimationFrame(() => {
      el.scrollLeft = left;
      el.scrollTop = top;
    });
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", className)} data-slot="seat-map">
      {showZoomControls ? (
        <div
          role="toolbar"
          aria-label={labels.zoom.label}
          className="flex items-center justify-end gap-1"
        >
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={labels.zoom.out}
            onClick={() => {
              zoomTo({ type: "out" });
            }}
          >
            <Minus aria-hidden />
          </Button>
          <span
            aria-hidden
            className="w-12 text-center font-mono text-xs text-muted-foreground tabular"
          >
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={labels.zoom.in}
            onClick={() => {
              zoomTo({ type: "in" });
            }}
          >
            <Plus aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={labels.zoom.reset}
            onClick={() => {
              // Back to the default size, which follows the screen width again.
              userZoomed.current = false;
              dispatchZoom({
                type: "reset",
                to: defaultZoom(scroller.current?.clientWidth ?? 0, naturalMapWidth(columns)),
              });
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        </div>
      ) : null}

      <p id={hintId} className="sr-only">
        {labels.keyboardHint}
      </p>

      {/* The zoomed map scrolls inside this box (never the page). touch-action keeps one-finger pan native
          and hands the two-finger pinch to us. CSS `zoom` changes the layout size, so the scroll area follows. */}
      <div
        ref={scroller}
        data-slot="seat-map-scroller"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="max-h-[75vh] w-full touch-pan-x touch-pan-y overflow-auto pb-2"
      >
        <div
          role="group"
          aria-label={ariaLabel}
          aria-describedby={hintId}
          aria-busy={disabled || undefined}
          onKeyDown={handleKeyDown}
          className="mx-auto grid w-max gap-1 px-2"
          style={{ gridTemplateColumns: `repeat(${columns + 2}, 2rem)`, zoom: scale }}
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
              row={seat.row}
              number={seat.number}
              type={seat.type}
              status={seat.status}
              priceBaht={seat.priceBaht}
              selected={selectedIds.includes(seat.id)}
              justTaken={justTakenIds.includes(seat.id)}
              pending={pendingIds.includes(seat.id)}
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

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
