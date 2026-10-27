import type { SeatStatus, SeatType } from "@/lib/seat";

/** Copy for the seat components. Thai is the default; next-intl will supply these later. */
export interface SeatLabels {
  type: Record<SeatType, string>;
  status: Record<SeatStatus, string>;
  selected: string;
}

export const seatLabelsTh: SeatLabels = {
  type: { STANDARD: "มาตรฐาน", PREMIUM: "พรีเมียม" },
  status: { AVAILABLE: "ว่าง", HELD: "กำลังถูกจอง", BOOKED: "จองแล้ว" },
  selected: "เลือกแล้ว",
};

export const seatLabelsEn: SeatLabels = {
  type: { STANDARD: "standard", PREMIUM: "premium" },
  status: { AVAILABLE: "available", HELD: "held", BOOKED: "booked" },
  selected: "selected",
};
