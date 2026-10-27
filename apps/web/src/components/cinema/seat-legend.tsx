import { cn } from "cn";
import { Seat } from "./seat";

export interface SeatLegendLabels {
  available: string;
  premium: string;
  selected: string;
  held: string;
  booked: string;
}

export const seatLegendLabelsTh: SeatLegendLabels = {
  available: "ว่าง",
  premium: "พรีเมียม",
  selected: "ที่เลือก",
  held: "กำลังถูกจอง",
  booked: "จองแล้ว",
};

export interface SeatLegendProps {
  labels?: SeatLegendLabels;
  className?: string;
}

/** Key for the seat colours. Swatches are decorative seats, hidden from assistive tech. */
export function SeatLegend({ labels = seatLegendLabelsTh, className }: SeatLegendProps) {
  const items = [
    { key: "available", type: "STANDARD", status: "AVAILABLE", selected: false },
    { key: "premium", type: "PREMIUM", status: "AVAILABLE", selected: false },
    { key: "selected", type: "STANDARD", status: "AVAILABLE", selected: true },
    { key: "held", type: "STANDARD", status: "HELD", selected: false },
    { key: "booked", type: "STANDARD", status: "BOOKED", selected: false },
  ] as const;

  return (
    <ul className={cn("flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className="pointer-events-none inline-flex scale-75">
            <Seat
              label=""
              type={item.type}
              status={item.status}
              selected={item.selected}
              priceBaht={0}
              tabIndex={-1}
            />
          </span>
          <span className="text-muted-foreground">{labels[item.key]}</span>
        </li>
      ))}
    </ul>
  );
}
