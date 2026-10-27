import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SeatMap } from "@/api/generated/model";
import { SEAT_POLL_MS, takenSelectedLabels, useTakenSeatDetector } from "./use-taken-seats";

function seatMap(generatedAt: string, statuses: Record<string, "AVAILABLE" | "HELD" | "BOOKED">) {
  return {
    showtimeId: "st",
    totalRows: 1,
    totalCols: 4,
    prices: [],
    generatedAt,
    seats: Object.entries(statuses).map(([label, status], i) => ({
      id: `id-${label}`,
      label,
      row: "A",
      number: i + 1,
      gridRow: 0,
      gridCol: i,
      type: "STANDARD" as const,
      status,
    })),
  } satisfies SeatMap;
}

describe("takenSelectedLabels", () => {
  it("returns only selected seats that are no longer available", () => {
    const map = seatMap("t1", { A1: "AVAILABLE", A2: "BOOKED", A3: "HELD", A4: "AVAILABLE" });
    expect(takenSelectedLabels(map, ["A1", "A2", "A3"])).toEqual(["A2", "A3"]);
  });

  it("ignores labels that are not on the map", () => {
    expect(takenSelectedLabels(seatMap("t1", { A1: "BOOKED" }), ["Z9"])).toEqual([]);
  });
});

describe("useTakenSeatDetector", () => {
  it("polls every 10 seconds", () => {
    expect(SEAT_POLL_MS).toBe(10_000);
  });

  it("reports taken seats once per refresh and not on selection changes", () => {
    const onTaken = vi.fn();
    const { rerender } = renderHook(
      ({ map, selected }) => {
        useTakenSeatDetector(map, selected, onTaken);
      },
      {
        initialProps: {
          map: seatMap("t1", { A1: "AVAILABLE", A2: "AVAILABLE" }),
          selected: ["A1", "A2"],
        },
      },
    );
    expect(onTaken).not.toHaveBeenCalled();

    // A refresh shows A2 taken.
    rerender({ map: seatMap("t2", { A1: "AVAILABLE", A2: "BOOKED" }), selected: ["A1", "A2"] });
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(onTaken).toHaveBeenLastCalledWith(["A2"]);

    // Same map again (e.g. the selection changed): no second toast.
    rerender({ map: seatMap("t2", { A1: "AVAILABLE", A2: "BOOKED" }), selected: ["A1"] });
    expect(onTaken).toHaveBeenCalledTimes(1);

    // Next refresh with nothing selected that is taken: still quiet.
    rerender({ map: seatMap("t3", { A1: "AVAILABLE", A2: "BOOKED" }), selected: ["A1"] });
    expect(onTaken).toHaveBeenCalledTimes(1);
  });

  it("reports seats that are already taken when the first map arrives", () => {
    const onTaken = vi.fn();
    renderHook(() => {
      useTakenSeatDetector(seatMap("t1", { A1: "BOOKED", A2: "AVAILABLE" }), ["A1", "A2"], onTaken);
    });
    expect(onTaken).toHaveBeenCalledWith(["A1"]);
  });

  it("does nothing while the map is loading", () => {
    const onTaken = vi.fn();
    renderHook(() => {
      useTakenSeatDetector(undefined, ["A1"], onTaken);
    });
    expect(onTaken).not.toHaveBeenCalled();
  });
});
