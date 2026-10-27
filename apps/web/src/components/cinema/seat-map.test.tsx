import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { seatLabelsEn } from "./labels";
import { SeatMap, type SeatMapSeat } from "./seat-map";

const seats: SeatMapSeat[] = ["A", "B"].flatMap((row, r) =>
  [1, 2, 3, 4, 5, 6].map((number) => ({
    id: `${row}${number}`,
    row,
    number,
    type: "STANDARD" as const,
    status: row === "B" && number === 1 ? ("BOOKED" as const) : ("AVAILABLE" as const),
    priceBaht: 200,
    gridRow: r + 1,
    // Aisle between columns 3 and 5.
    gridCol: number <= 3 ? number : number + 1,
  })),
);

function Harness({ onRejected }: { onRejected?: (reason: "limit" | "unavailable") => void }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <SeatMap
      seats={seats}
      selectedIds={ids}
      onSelectionChange={setIds}
      onRejected={onRejected}
      labels={seatLabelsEn}
    />
  );
}

const seat = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label},`) });

describe("SeatMap", () => {
  it("toggles a seat on and off", async () => {
    render(<Harness />);
    await userEvent.click(seat("A1"));
    expect(seat("A1")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(seat("A1"));
    expect(seat("A1")).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects a fifth seat with 'limit'", async () => {
    const onRejected = vi.fn();
    render(<Harness onRejected={onRejected} />);
    for (const id of ["A1", "A2", "A3", "A4"]) await userEvent.click(seat(id));
    expect(onRejected).not.toHaveBeenCalled();
    await userEvent.click(seat("A5"));
    expect(onRejected).toHaveBeenCalledWith("limit");
    expect(seat("A5")).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores clicks on unavailable seats", async () => {
    render(<Harness />);
    await userEvent.click(seat("B1"));
    expect(seat("B1")).not.toHaveAttribute("aria-pressed");
  });

  it("moves focus with arrow keys, across the aisle and between rows", async () => {
    render(<Harness />);
    act(() => {
      seat("A3").focus();
    });
    await userEvent.keyboard("{ArrowRight}");
    expect(seat("A4")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(seat("B4")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(seat("A3")).toHaveFocus();
  });

  it("uses a roving tabindex and toggles with Enter", async () => {
    render(<Harness />);
    expect(seat("A1")).toHaveAttribute("tabindex", "0");
    expect(seat("A2")).toHaveAttribute("tabindex", "-1");
    act(() => {
      seat("A2").focus();
    });
    await userEvent.keyboard("{Enter}");
    expect(seat("A2")).toHaveAttribute("aria-pressed", "true");
    expect(seat("A2")).toHaveAttribute("tabindex", "0");
  });
});
