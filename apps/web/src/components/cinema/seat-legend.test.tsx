import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeatLegend } from "./seat-legend";

describe("SeatLegend", () => {
  it("lists the five states", () => {
    render(<SeatLegend />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows the person icon for the two occupied entries only (held and booked)", () => {
    render(<SeatLegend />);
    const items = screen.getAllByRole("listitem");
    const withIcon = items.filter((li) => li.querySelector('svg[data-icon="person"]'));
    expect(withIcon.map((li) => li.textContent)).toEqual(["กำลังถูกจอง", "จองแล้ว"]);
  });
});
