import type { CSSProperties, Ref } from "react";
import { cn } from "cn";
import { formatBaht } from "@/lib/format";
import type { SeatStatus, SeatType } from "@/lib/seat";
import { seatLabelsTh, type SeatLabels } from "./labels";

export interface SeatProps {
  /** Seat name, e.g. "A5". */
  label: string;
  type: SeatType;
  status: SeatStatus;
  selected?: boolean;
  /** The seat was taken by someone else while selected: flashes for ~3 s. */
  justTaken?: boolean;
  priceBaht: number;
  onToggle?: () => void;
  labels?: SeatLabels;
  /** Roving tabindex support for the seat map. */
  tabIndex?: number;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
  style?: CSSProperties;
  onFocus?: () => void;
  "data-seat-id"?: string;
}

/** One cinema chair: a rounded back with an armrest bar. Colours come only from the seat tokens. */
export function Seat({
  label,
  type,
  status,
  selected = false,
  justTaken = false,
  priceBaht,
  onToggle,
  labels = seatLabelsTh,
  className,
  ...rest
}: SeatProps) {
  const unavailable = status !== "AVAILABLE";
  // A selected seat that was taken meanwhile can still be clicked to leave the selection.
  const inert = unavailable && !selected;
  const stateText = selected ? labels.selected : labels.status[status];
  const ariaLabel = `${label}, ${labels.type[type]}, ${formatBaht(priceBaht)}, ${stateText}`;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={inert ? undefined : selected}
      aria-disabled={unavailable || undefined}
      data-status={status}
      data-type={type}
      onClick={() => {
        if (!inert) onToggle?.();
      }}
      className={cn(
        "relative flex size-8 shrink-0 items-start justify-center rounded-t-xl rounded-b-sm pt-1 text-[10px] leading-none font-medium tabular transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "bg-seat-selected text-seat-selected-foreground"
          : status === "AVAILABLE"
            ? type === "PREMIUM"
              ? "bg-seat-premium text-foreground/80 hover:bg-seat-premium-hover"
              : "bg-seat-available text-foreground/80 hover:bg-seat-available-hover"
            : status === "HELD"
              ? "bg-seat-held bg-[repeating-linear-gradient(135deg,transparent_0_3px,color-mix(in_oklch,var(--foreground)_28%,transparent)_3px_5px)] text-foreground/80"
              : "bg-seat-booked text-muted-foreground",
        inert && "cursor-not-allowed",
        justTaken && "animate-seat-taken",
        className,
      )}
      {...rest}
    >
      {status === "BOOKED" && !selected ? (
        <span aria-hidden className="text-sm leading-none">
          ✕
        </span>
      ) : (
        <span aria-hidden>{label}</span>
      )}
      <span
        aria-hidden
        className="absolute inset-x-0.5 bottom-0.5 h-1.5 rounded-sm bg-foreground/20"
      />
    </button>
  );
}
