import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountdownChip } from "./countdown-chip";

describe("CountdownChip", () => {
  it.each([
    [252_000, "4:12", "normal"],
    [45_000, "0:45", "warning"],
    [0, "0:00", "expired"],
  ] as const)("%i ms shows %s with %s tone", (msLeft, text, tone) => {
    render(<CountdownChip msLeft={msLeft} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent(text);
    expect(timer).toHaveAttribute("data-tone", tone);
  });
});
