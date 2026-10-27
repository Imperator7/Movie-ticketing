export type SeatKind = "STANDARD" | "PREMIUM";

export interface HallLayoutSpec {
  rows: number;
  /** Seats per row (not counting aisles). */
  cols: number;
  /** Aisle (gap) after these seat numbers, e.g. [4, 12] puts a gap after seat 4 and after seat 12. */
  aisleAfter: readonly number[];
  /** The last N rows (furthest from the screen) are PREMIUM. */
  premiumRows: number;
  /** Seat labels that are out of service, e.g. "A1". */
  inactive?: readonly string[];
}

export interface SeatSpec {
  rowLabel: string;
  seatNumber: number;
  gridRow: number;
  gridCol: number;
  type: SeatKind;
  isActive: boolean;
}

export interface HallLayout {
  totalRows: number;
  /** Grid columns, including the aisle gaps. */
  totalCols: number;
  seats: SeatSpec[];
}

/** A, B, ... Z, AA, AB ... */
export function rowLabelFor(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Row A is nearest the screen. Aisles shift `gridCol` so the web can draw gaps. */
export function buildSeatLayout(spec: HallLayoutSpec): HallLayout {
  if (spec.rows < 1 || spec.cols < 1) throw new RangeError("rows and cols must be positive");
  if (spec.premiumRows < 0 || spec.premiumRows > spec.rows)
    throw new RangeError("premiumRows out of range");
  const aisles = [...new Set(spec.aisleAfter)].filter((after) => after >= 1 && after < spec.cols);
  const inactive = new Set(spec.inactive ?? []);

  const seats: SeatSpec[] = [];
  for (let row = 0; row < spec.rows; row++) {
    const rowLabel = rowLabelFor(row);
    const type: SeatKind = row >= spec.rows - spec.premiumRows ? "PREMIUM" : "STANDARD";
    for (let number = 1; number <= spec.cols; number++) {
      const gapsBefore = aisles.filter((after) => after < number).length;
      seats.push({
        rowLabel,
        seatNumber: number,
        gridRow: row,
        gridCol: number - 1 + gapsBefore,
        type,
        isActive: !inactive.has(`${rowLabel}${String(number)}`),
      });
    }
  }
  return { totalRows: spec.rows, totalCols: spec.cols + aisles.length, seats };
}
