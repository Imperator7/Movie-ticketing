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

  it.each(["BOOKED", "HELD"] as const)("shows the solid person icon for a %s seat", (status) => {
    const { container } = render(<Seat {...base} status={status} />);
    expect(container.querySelector('svg[data-icon="person"]')).not.toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // The seat's name is still in its aria-label, not drawn on it.
    expect(screen.getByRole("button")).toHaveAccessibleName(/A5,/);
    expect(container).not.toHaveTextContent("A5");
  });

  it("keeps the label (no icon) for available and selected seats", () => {
    const { container, rerender } = render(<Seat {...base} status="AVAILABLE" />);
    expect(container.querySelector('svg[data-icon="person"]')).toBeNull();
    expect(container).toHaveTextContent("A5");
    rerender(<Seat {...base} status="AVAILABLE" selected />);
    expect(container.querySelector('svg[data-icon="person"]')).toBeNull();
    expect(container).toHaveTextContent("A5");
  });

  it("a selected seat that is held by our own pending booking keeps its label and is busy", () => {
    const { container } = render(<Seat {...base} status="HELD" selected pending />);
    expect(container.querySelector('svg[data-icon="person"]')).toBeNull();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});
