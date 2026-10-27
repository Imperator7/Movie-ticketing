import { Ticket } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { CountdownChip } from "./countdown-chip";

export interface BookingBannerLabels {
  title: string;
  seats: string;
  continuePayment: string;
  cancel: string;
  timeLeft: string;
}

export const bookingBannerLabelsTh: BookingBannerLabels = {
  title: "กำลังจองอยู่",
  seats: "ที่นั่ง",
  continuePayment: "ชำระเงินต่อ",
  cancel: "ยกเลิก",
  timeLeft: "เวลาที่เหลือ",
};

export interface BookingBannerProps {
  movieTitle: string;
  seats: readonly string[];
  msLeft: number;
  onContinue: () => void;
  onCancel: () => void;
  labels?: BookingBannerLabels;
  className?: string;
}

/** "Booking in progress" bar (plan §6): sticky at the top, wraps on small screens. */
export function BookingBanner({
  movieTitle,
  seats,
  msLeft,
  onContinue,
  onCancel,
  labels = bookingBannerLabelsTh,
  className,
}: BookingBannerProps) {
  return (
    <div
      role="region"
      aria-label={labels.title}
      className={cn(
        "sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gold/40 bg-card px-4 py-2.5 shadow-md",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <Ticket aria-hidden className="size-5 shrink-0 text-gold" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {labels.title} · {movieTitle}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {labels.seats} {seats.join(", ")}
          </p>
        </div>
      </div>
      <CountdownChip msLeft={msLeft} ariaLabel={labels.timeLeft} />
      <div className="flex gap-2">
        <Button size="sm" onClick={onContinue}>
          {labels.continuePayment}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {labels.cancel}
        </Button>
      </div>
    </div>
  );
}
