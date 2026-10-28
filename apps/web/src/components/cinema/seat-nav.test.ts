import { describe, expect, it } from "vitest";
import { isNavKey, nextSeat, type NavSeat } from "./seat-nav";

/**
 * Row 0:  a0 a1 .  a3 a4        (column 2 is an aisle)
 * Row 1:  (empty row, no seats)
 * Row 2:  b0 b1 b2 b3 b4        (full)
 * Row 3:  c0 .  .  c3           (gaps, shorter row)
 */
const seats: NavSeat[] = [
  ...[0, 1, 3, 4].map((c) => ({ id: `a${String(c)}`, gridRow: 0, gridCol: c })),
  ...[0, 1, 2, 3, 4].map((c) => ({ id: `b${String(c)}`, gridRow: 2, gridCol: c })),
  ...[0, 3].map((c) => ({ id: `c${String(c)}`, gridRow: 3, gridCol: c })),
];

const go = (from: string, key: Parameters<typeof nextSeat>[2], ctrl = false) =>
  nextSeat(seats, from, key, ctrl)?.id;

describe("nextSeat", () => {
  it("Left/Right step over an aisle", () => {
    expect(go("a1", "ArrowRight")).toBe("a3");
    expect(go("a3", "ArrowLeft")).toBe("a1");
    expect(go("c0", "ArrowRight")).toBe("c3");
  });

  it("does not wrap at the row ends", () => {
    expect(go("a4", "ArrowRight")).toBeUndefined();
    expect(go("a0", "ArrowLeft")).toBeUndefined();
  });

  it("Up/Down skip an empty row and keep the column", () => {
    expect(go("a1", "ArrowDown")).toBe("b1");
    expect(go("b3", "ArrowUp")).toBe("a3");
  });

  it("Up/Down land on the nearest column when the next row has a gap there", () => {
    expect(go("b1", "ArrowDown")).toBe("c0"); // c1 is missing; c0 is nearer than c3
    expect(go("b2", "ArrowDown")).toBe("c3"); // equidistant from c0? no: |2-0|=2, |2-3|=1
    expect(go("b4", "ArrowDown")).toBe("c3");
  });

  it("does not move past the first or last row", () => {
    expect(go("a0", "ArrowUp")).toBeUndefined();
    expect(go("c3", "ArrowDown")).toBeUndefined();
  });

  it("Home/End go to the row ends, Ctrl+Home/End to the map's corners", () => {
    expect(go("a3", "Home")).toBe("a0");
    expect(go("a1", "End")).toBe("a4");
    expect(go("b2", "Home", true)).toBe("a0");
    expect(go("b2", "End", true)).toBe("c3");
  });

  it("PageUp/PageDown go to the first or last row in the same column", () => {
    expect(go("b3", "PageUp")).toBe("a3");
    expect(go("b1", "PageDown")).toBe("c0");
  });

  it("an unknown current seat does nothing", () => {
    expect(go("zz", "ArrowRight")).toBeUndefined();
  });

  it("isNavKey recognises the navigation keys only", () => {
    expect(isNavKey("ArrowLeft")).toBe(true);
    expect(isNavKey("Home")).toBe(true);
    expect(isNavKey("Enter")).toBe(false);
    expect(isNavKey("a")).toBe(false);
  });
});
