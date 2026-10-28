import { describe, expect, it } from "vitest";
import { moviesPath, parsePage } from "./movies-url";

describe("parsePage", () => {
  it("accepts positive integers and falls back to 1", () => {
    expect(parsePage("3")).toBe(3);
    for (const bad of [null, undefined, "", "0", "-2", "1.5", "abc"])
      expect(parsePage(bad)).toBe(1);
  });
});

describe("moviesPath", () => {
  it("is /movies without filters", () => {
    expect(moviesPath({})).toBe("/movies");
    expect(moviesPath({ genre: "", q: "", page: 1 })).toBe("/movies");
  });

  it("keeps genre, search and page in the URL (page 1 is implicit)", () => {
    expect(moviesPath({ genre: "horror", q: "godzilla", page: 2 })).toBe(
      "/movies?genre=horror&q=godzilla&page=2",
    );
    expect(moviesPath({ genre: "horror" })).toBe("/movies?genre=horror");
  });

  it("encodes Thai and special characters in the search", () => {
    const path = moviesPath({ q: "ก็อดซิลล่า & co" });
    expect(new URL(path, "http://x").searchParams.get("q")).toBe("ก็อดซิลล่า & co");
  });
});
