import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { seatLabelsEn } from "./labels";
import { SeatMap, seatGridPlacement, type SeatMapSeat } from "./seat-map";

const seats: SeatMapSeat[] = ["A", "B"].flatMap((row, r) =>
  [1, 2, 3, 4, 5, 6].map((number) => ({
    id: `${row}${number}`,
    row,
    number,
    type: "STANDARD" as const,
    status: row === "B" && number === 1 ? ("BOOKED" as const) : ("AVAILABLE" as const),
    priceBaht: 200,
    gridRow: r,
    // Aisle between columns 3 and 5.
    gridCol: number <= 3 ? number - 1 : number,
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

/** "A5" -> the seat button named "Row A, seat 5, ...". */
const seat = (label: string) =>
  screen.getByRole("button", {
    name: new RegExp(`^Row ${label.slice(0, 1)}, seat ${label.slice(1)},`),
  });

describe("seatGridPlacement", () => {
  it("converts 0-based contract positions to CSS grid cells after the row-label column", () => {
    expect(seatGridPlacement({ gridRow: 0, gridCol: 0 })).toEqual({ gridRow: 1, gridColumn: 2 });
    expect(seatGridPlacement({ gridRow: 7, gridCol: 14 })).toEqual({ gridRow: 8, gridColumn: 16 });
  });
});

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

describe("SeatMap keyboard", () => {
  it("is one tab stop and the focus ring comes from the ring token", () => {
    render(<Harness />);
    const tabbable = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") === "0");
    // One seat is tabbable (the zoom buttons are real buttons and tabbable too, but not seats).
    expect(tabbable.filter((b) => b.hasAttribute("data-seat-id"))).toHaveLength(1);
    expect(seat("A1").className).toContain("focus-visible:ring-ring");
  });

  it("Right skips the aisle, Left skips it back, and neither wraps off the row", async () => {
    render(<Harness />);
    act(() => {
      seat("A3").focus();
    });
    await userEvent.keyboard("{ArrowRight}");
    expect(seat("A4")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(seat("A3")).toHaveFocus();
    act(() => {
      seat("A6").focus();
    });
    await userEvent.keyboard("{ArrowRight}");
    expect(seat("A6")).toHaveFocus();
    act(() => {
      seat("A1").focus();
    });
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(seat("A1")).toHaveFocus();
  });

  it("Home and End go to the ends of the row", async () => {
    render(<Harness />);
    act(() => {
      seat("B3").focus();
    });
    await userEvent.keyboard("{End}");
    expect(seat("B6")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(seat("B1")).toHaveFocus();
  });

  it("an occupied seat is focusable, announced as booked and unavailable, and does not toggle", async () => {
    const onRejected = vi.fn();
    render(<Harness onRejected={onRejected} />);
    act(() => {
      seat("B1").focus();
    });
    expect(seat("B1")).toHaveFocus();
    expect(seat("B1")).toHaveAccessibleName("Row B, seat 1, standard, ฿200, booked");
    expect(seat("B1")).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}{ }");
    expect(seat("B1")).not.toHaveAttribute("aria-pressed");
  });

  it("Space toggles too", async () => {
    render(<Harness />);
    act(() => {
      seat("A2").focus();
    });
    await userEvent.keyboard(" ");
    expect(seat("A2")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("SeatMap labels and announcements", () => {
  it("names a seat by row, number, type and state in English and Thai", () => {
    const premium: SeatMapSeat[] = seats
      .slice(0, 1)
      .map((s) => ({ ...s, type: "PREMIUM" as const }));
    const { unmount } = render(
      <SeatMap
        seats={premium}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        labels={seatLabelsEn}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Row A, seat 1, premium, ฿200, available" }),
    ).toBeInTheDocument();
    unmount();
    render(<SeatMap seats={premium} selectedIds={[]} onSelectionChange={() => undefined} />);
    expect(
      screen.getByRole("button", { name: "แถว A ที่นั่ง 1, พรีเมียม, ฿200, ว่าง" }),
    ).toBeInTheDocument();
  });

  it("announces selecting, deselecting and the seat limit in the live region", async () => {
    render(<Harness />);
    const live = screen.getByRole("status");
    await userEvent.click(seat("A1"));
    expect(live).toHaveTextContent("Row A, seat 1 selected. 1 of 4 seats chosen");
    await userEvent.click(seat("A1"));
    expect(live).toHaveTextContent("Row A, seat 1 removed. 0 seats chosen");
    for (const id of ["A1", "A2", "A3", "A4"]) await userEvent.click(seat(id));
    await userEvent.click(seat("A5"));
    expect(live).toHaveTextContent("You can select up to 4 seats");
  });

  it("describes how to use the keyboard on the map", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "แผนผังที่นั่ง" });
    const hint = document.getElementById(group.getAttribute("aria-describedby") ?? "");
    expect(hint).toHaveTextContent("Use the arrow keys");
  });
});

describe("SeatMap zoom controls", () => {
  it("zooms in and out with the buttons, clamps, and resets", async () => {
    render(<Harness />);
    const zoom = screen.getByRole("toolbar", { name: "Zoom the seat map" });
    const percent = () => /(\d+)%/.exec(zoom.textContent)?.[1];
    expect(percent()).toBe("100");
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("125");
    for (let i = 0; i < 10; i++)
      await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("250");
    for (let i = 0; i < 20; i++)
      await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(percent()).toBe("50");
    await userEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(percent()).toBe("100");
  });

  it("+ and - zoom from the keyboard while a seat has focus", async () => {
    render(<Harness />);
    act(() => {
      seat("A1").focus();
    });
    await userEvent.keyboard("+");
    expect(screen.getByRole("toolbar").textContent).toContain("125%");
    await userEvent.keyboard("-");
    expect(screen.getByRole("toolbar").textContent).toContain("100%");
  });

  it("can hide the zoom controls", () => {
    render(
      <SeatMap
        seats={seats}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        showZoomControls={false}
      />,
    );
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
