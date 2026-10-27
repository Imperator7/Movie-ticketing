import { cn } from "cn";
import { formatShowtime } from "@/lib/format";

export type ShowtimeFormat = "2D" | "3D" | "IMAX";

export interface ShowtimeChipLabels {
  fewSeatsLeft: (seatsLeft: number) => string;
  closed: string;
}

export const showtimeChipLabelsTh: ShowtimeChipLabels = {
  fewSeatsLeft: (n) => `เหลือ ${n} ที่`,
  closed: "ปิดจอง",
};

export interface ShowtimeChipProps {
  /** ISO start time; shown in Bangkok time. */
  startsAt: string;
  format: ShowtimeFormat;
  seatsLeft: number;
  /** Booking is closed (the showtime started more than 30 minutes ago). */
  closed?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  labels?: ShowtimeChipLabels;
  className?: string;
}

const FEW_SEATS_THRESHOLD = 10;

export function ShowtimeChip({
  startsAt,
  format,
  seatsLeft,
  closed = false,
  selected = false,
  onSelect,
  labels = showtimeChipLabelsTh,
  className,
}: ShowtimeChipProps) {
  const fewLeft = !closed && seatsLeft <= FEW_SEATS_THRESHOLD;
  return (
    <button
      type="button"
      disabled={closed}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-w-24 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        selected
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border bg-card hover:bg-muted",
        className,
      )}
    >
      <span className="font-mono text-lg leading-tight font-semibold tabular">
        {formatShowtime(startsAt)}
      </span>
      <span className="rounded-sm bg-secondary px-1.5 text-[11px] font-medium text-secondary-foreground">
        {format}
      </span>
      {closed ? (
        <span className="text-xs text-muted-foreground">{labels.closed}</span>
      ) : fewLeft ? (
        <span className="text-xs font-medium text-warning">{labels.fewSeatsLeft(seatsLeft)}</span>
      ) : null}
    </button>
  );
}
