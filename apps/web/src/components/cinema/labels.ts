import type { SeatStatus, SeatType } from "@/lib/seat";

/** Copy for the seat components. Thai is the default; the app supplies it from next-intl (see `useSeatCopy`). */
export interface SeatLabels {
  type: Record<SeatType, string>;
  status: Record<SeatStatus, string>;
  selected: string;
  /** Spoken name of a seat: "Row A, seat 5". */
  seatName: (row: string, number: number) => string;
  /** Live-region announcements of the seat map. */
  announce: {
    selected: (seat: string, count: number, max: number) => string;
    deselected: (seat: string, count: number) => string;
    limit: (max: number) => string;
  };
  /** Zoom toolbar (mobile pinch has these buttons as the non-gesture alternative). */
  zoom: {
    label: string;
    in: string;
    out: string;
    reset: string;
  };
  /** How to operate the map with a keyboard; read when the map gets focus. */
  keyboardHint: string;
}

export const seatLabelsTh: SeatLabels = {
  type: { STANDARD: "มาตรฐาน", PREMIUM: "พรีเมียม" },
  status: { AVAILABLE: "ว่าง", HELD: "กำลังถูกจอง", BOOKED: "จองแล้ว" },
  selected: "เลือกแล้ว",
  seatName: (row, number) => `แถว ${row} ที่นั่ง ${String(number)}`,
  announce: {
    selected: (seat, count, max) =>
      `เลือก${seat}แล้ว เลือกไว้ ${String(count)} จาก ${String(max)} ที่นั่ง`,
    deselected: (seat, count) => `ยกเลิก${seat}แล้ว เลือกไว้ ${String(count)} ที่นั่ง`,
    limit: (max) => `เลือกได้สูงสุด ${String(max)} ที่นั่ง`,
  },
  zoom: { label: "ซูมแผนผังที่นั่ง", in: "ขยาย", out: "ย่อ", reset: "ขนาดเริ่มต้น" },
  keyboardHint: "ใช้ปุ่มลูกศรเลื่อนระหว่างที่นั่ง กด Enter หรือ Space เพื่อเลือก",
};

export const seatLabelsEn: SeatLabels = {
  type: { STANDARD: "standard", PREMIUM: "premium" },
  status: { AVAILABLE: "available", HELD: "held", BOOKED: "booked" },
  selected: "selected",
  seatName: (row, number) => `Row ${row}, seat ${String(number)}`,
  announce: {
    selected: (seat, count, max) =>
      `${seat} selected. ${String(count)} of ${String(max)} seats chosen`,
    deselected: (seat, count) => `${seat} removed. ${String(count)} seats chosen`,
    limit: (max) => `You can select up to ${String(max)} seats`,
  },
  zoom: { label: "Zoom the seat map", in: "Zoom in", out: "Zoom out", reset: "Reset zoom" },
  keyboardHint: "Use the arrow keys to move between seats. Press Enter or Space to select.",
};
