import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { seatLabelsEn } from "./labels";
import { Seat } from "./seat";

const base = { label: "A5", type: "PREMIUM", priceBaht: 260, labels: seatLabelsEn } as const;

describe("Seat", () => {
  it("has a full aria-label", () => {
    render(<Seat {...base} status="AVAILABLE" />);
    expect(
      screen.getByRole("button", { name: "A5, premium, ฿260, available" }),
    ).toBeInTheDocument();
  });

  it("reflects selection with aria-pressed", () => {
    const { rerender } = render(<Seat {...base} status="AVAILABLE" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(<Seat {...base} status="AVAILABLE" selected />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggle when an available seat is clicked", async () => {
    const onToggle = vi.fn();
    render(<Seat {...base} status="AVAILABLE" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it.each(["HELD", "BOOKED"] as const)("does not toggle a %s seat", async (status) => {
    const onToggle = vi.fn();
    render(<Seat {...base} status={status} onToggle={onToggle} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
