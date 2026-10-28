/** Keyboard navigation over seats placed on a grid. Pure, so gaps and aisles are easy to test. */

export interface NavSeat {
  id: string;
  gridRow: number;
  gridCol: number;
}

export type NavKey =
  "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End" | "PageUp" | "PageDown";

const NAV_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

export function isNavKey(key: string): key is NavKey {
  return NAV_KEYS.includes(key);
}

function rowOf(seats: readonly NavSeat[], gridRow: number): NavSeat[] {
  return seats.filter((s) => s.gridRow === gridRow).sort((a, b) => a.gridCol - b.gridCol);
}

/** Seat in `row` whose column is nearest to `col` (the lower column wins a tie). */
function nearestInRow(row: readonly NavSeat[], col: number): NavSeat | undefined {
  let best: NavSeat | undefined;
  for (const seat of row) {
    if (!best || Math.abs(seat.gridCol - col) < Math.abs(best.gridCol - col)) best = seat;
  }
  return best;
}

/**
 * The seat to focus after `key`, or undefined to stay where we are (navigation does not wrap).
 * - Left/Right: the next seat in the row, stepping over aisles and other gaps.
 * - Up/Down: the nearest column in the next row that has seats (empty rows are skipped).
 * - Home/End: first/last seat of the row. Ctrl+Home/End (`ctrl`): first/last seat of the map.
 * - PageUp/PageDown: first/last row, same column.
 */
export function nextSeat(
  seats: readonly NavSeat[],
  currentId: string,
  key: NavKey,
  ctrl = false,
): NavSeat | undefined {
  const current = seats.find((s) => s.id === currentId);
  if (!current) return undefined;
  const rows = [...new Set(seats.map((s) => s.gridRow))].sort((a, b) => a - b);

  switch (key) {
    case "ArrowLeft":
    case "ArrowRight": {
      const sign = key === "ArrowRight" ? 1 : -1;
      const candidates = rowOf(seats, current.gridRow).filter(
        (s) => (s.gridCol - current.gridCol) * sign > 0,
      );
      return sign > 0 ? candidates[0] : candidates[candidates.length - 1];
    }
    case "ArrowUp":
    case "ArrowDown": {
      const index = rows.indexOf(current.gridRow) + (key === "ArrowDown" ? 1 : -1);
      const target = rows[index];
      return target === undefined ? undefined : nearestInRow(rowOf(seats, target), current.gridCol);
    }
    case "Home":
    case "End": {
      const first = key === "Home";
      if (ctrl) {
        const row = rowOf(seats, (first ? rows[0] : rows[rows.length - 1]) ?? current.gridRow);
        return first ? row[0] : row[row.length - 1];
      }
      const row = rowOf(seats, current.gridRow);
      return first ? row[0] : row[row.length - 1];
    }
    case "PageUp":
    case "PageDown": {
      const target = key === "PageUp" ? rows[0] : rows[rows.length - 1];
      return target === undefined ? undefined : nearestInRow(rowOf(seats, target), current.gridCol);
    }
  }
}
