import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RatingBadge, type ThaiRating } from "./rating-badge";

describe("RatingBadge", () => {
  it.each([
    ["PROMOTED", "ส"],
    ["GENERAL", "ท"],
    ["AGE_13", "น13+"],
    ["AGE_15", "น15+"],
    ["AGE_18", "น18+"],
    ["AGE_20", "ฉ20-"],
  ] as [ThaiRating, string][])("renders %s as %s", (rating, label) => {
    render(<RatingBadge rating={rating} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
