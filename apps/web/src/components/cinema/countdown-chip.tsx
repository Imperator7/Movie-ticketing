import { Timer } from "lucide-react";
import { cn } from "cn";
import { countdownTone, formatCountdown, type CountdownTone } from "@/lib/format";

export interface CountdownChipProps {
  /** Milliseconds left. The parent owns the clock and re-renders with new values. */
  msLeft: number;
  /** Accessible name, e.g. "เวลาที่เหลือ". */
  ariaLabel?: string;
  className?: string;
}

const toneStyles: Record<CountdownTone, string> = {
  normal: "border-border bg-muted text-foreground",
  warning: "animate-marquee-glow border-warning/50 bg-warning/15 text-warning",
  expired: "border-destructive/50 bg-destructive/15 text-destructive",
};

export function CountdownChip({
  msLeft,
  ariaLabel = "เวลาที่เหลือ",
  className,
}: CountdownChipProps) {
  const tone = countdownTone(msLeft);
  return (
    <span
      role="timer"
      aria-label={ariaLabel}
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-sm font-semibold tabular",
        toneStyles[tone],
        className,
      )}
    >
      <Timer aria-hidden className="size-3.5" />
      {formatCountdown(msLeft)}
    </span>
  );
}
