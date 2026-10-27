import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceSummary, priceSummaryLabelsTh } from "./price-summary";

const seats = [
  { id: "A5", label: "A5", priceBaht: 260 },
  { id: "A6", label: "A6", priceBaht: 260 },
  { id: "C1", label: "C1", priceBaht: 220 },
];

describe("PriceSummary", () => {
  it("shows the total and enables Buy", async () => {
    const onBuy = vi.fn();
    render(<PriceSummary seats={seats} onBuy={onBuy} />);
    expect(screen.getByTestId("price-total")).toHaveTextContent("฿740");
    const buy = screen.getByRole("button", { name: priceSummaryLabelsTh.buy });
    expect(buy).toBeEnabled();
    await userEvent.click(buy);
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it("disables Buy with no seats", () => {
    render(<PriceSummary seats={[]} onBuy={vi.fn()} />);
    expect(screen.getByRole("button", { name: priceSummaryLabelsTh.buy })).toBeDisabled();
    expect(screen.getByText(priceSummaryLabelsTh.empty)).toBeInTheDocument();
  });

  it("disables Buy while loading", () => {
    render(<PriceSummary seats={seats} onBuy={vi.fn()} loading />);
    expect(screen.getByRole("button", { name: priceSummaryLabelsTh.buying })).toBeDisabled();
  });
});
