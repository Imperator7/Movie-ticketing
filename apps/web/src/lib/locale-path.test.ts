import { describe, expect, it } from "vitest";
import { switchLocalePath } from "./locale-path";

describe("switchLocalePath", () => {
  it("swaps only the locale segment", () => {
    expect(switchLocalePath("/th/movies/dune", "", "en")).toBe("/en/movies/dune");
    expect(switchLocalePath("/en/movies/dune", "", "th")).toBe("/th/movies/dune");
  });

  it("keeps the query string", () => {
    expect(switchLocalePath("/th/showtime", "id=abc&seats=A5%2CA6", "en")).toBe(
      "/en/showtime?id=abc&seats=A5%2CA6",
    );
    expect(switchLocalePath("/th/showtime", "?id=abc", "en")).toBe("/en/showtime?id=abc");
  });

  it("handles the locale home with and without a trailing slash", () => {
    expect(switchLocalePath("/th", "", "en")).toBe("/en");
    expect(switchLocalePath("/th/", "", "en")).toBe("/en");
  });

  it("does not touch a later segment that looks like a locale", () => {
    expect(switchLocalePath("/th/en/x", "", "en")).toBe("/en/en/x");
  });

  it("prefixes a path that has no locale", () => {
    expect(switchLocalePath("/movies", "", "en")).toBe("/en/movies");
  });
});
