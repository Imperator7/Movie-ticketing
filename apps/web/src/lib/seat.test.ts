import { describe, expect, it } from "vitest";
import { type SeatStatus, findTakenSeats, isSelectable, toggleSeat } from "./seat";

describe("isSelectable", () => {
  it("only allows available seats", () => {
    expect(isSelectable("AVAILABLE")).toBe(true);
    expect(isSelectable("HELD")).toBe(false);
    expect(isSelectable("BOOKED")).toBe(false);
  });
});

describe("toggleSeat", () => {
  it("adds an available seat", () => {
    expect(toggleSeat(["a"], "b", "AVAILABLE")).toEqual({ selection: ["a", "b"], rejected: null });
  });

  it("removes a selected seat", () => {
    expect(toggleSeat(["a", "b"], "a", "AVAILABLE")).toEqual({ selection: ["b"], rejected: null });
  });

  it("lets a seat be deselected even if it has since been taken", () => {
    expect(toggleSeat(["a"], "a", "BOOKED").selection).toEqual([]);
  });

  it("refuses held and booked seats", () => {
    expect(toggleSeat([], "a", "HELD").rejected).toBe("unavailable");
    expect(toggleSeat([], "a", "BOOKED").rejected).toBe("unavailable");
  });

  it("refuses a fifth seat", () => {
    const result = toggleSeat(["a", "b", "c", "d"], "e", "AVAILABLE");
    expect(result).toEqual({ selection: ["a", "b", "c", "d"], rejected: "limit" });
  });

  it("does not mutate the input selection", () => {
    const selection = ["a"];
    toggleSeat(selection, "b", "AVAILABLE");
    expect(selection).toEqual(["a"]);
  });
});

describe("findTakenSeats", () => {
  const statuses = new Map<string, SeatStatus>([
    ["a", "AVAILABLE"],
    ["b", "HELD"],
    ["c", "BOOKED"],
  ]);

  it("returns selected seats that are no longer available", () => {
    expect(findTakenSeats(["a", "b", "c"], statuses)).toEqual(["b", "c"]);
  });

  it("ignores seats missing from the map", () => {
    expect(findTakenSeats(["zzz"], statuses)).toEqual([]);
  });
});
