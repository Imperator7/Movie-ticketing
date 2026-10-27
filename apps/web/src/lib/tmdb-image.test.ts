import { describe, expect, it } from "vitest";
import { isTmdbImage, tmdbImage, tmdbSrcSet } from "./tmdb-image";

const poster = "https://image.tmdb.org/t/p/w500/abc123.jpg";

describe("tmdbImage", () => {
  it("swaps the size segment", () => {
    expect(tmdbImage(poster, "w185")).toBe("https://image.tmdb.org/t/p/w185/abc123.jpg");
    expect(tmdbImage(poster, "w780")).toBe("https://image.tmdb.org/t/p/w780/abc123.jpg");
    expect(tmdbImage("https://image.tmdb.org/t/p/original/x.jpg", "w1280")).toBe(
      "https://image.tmdb.org/t/p/w1280/x.jpg",
    );
  });

  it("passes non-TMDB URLs through untouched", () => {
    expect(tmdbImage("https://example.com/w500/poster.jpg", "w185")).toBe(
      "https://example.com/w500/poster.jpg",
    );
    expect(tmdbImage("/posters/local.png", "w342")).toBe("/posters/local.png");
  });

  it("returns null for null, undefined and empty", () => {
    expect(tmdbImage(null, "w342")).toBeNull();
    expect(tmdbImage(undefined, "w342")).toBeNull();
    expect(tmdbImage("", "w342")).toBeNull();
  });
});

describe("tmdbSrcSet", () => {
  it("lists the poster widths by default", () => {
    expect(tmdbSrcSet(poster)).toBe(
      [
        "https://image.tmdb.org/t/p/w185/abc123.jpg 185w",
        "https://image.tmdb.org/t/p/w342/abc123.jpg 342w",
        "https://image.tmdb.org/t/p/w500/abc123.jpg 500w",
        "https://image.tmdb.org/t/p/w780/abc123.jpg 780w",
      ].join(", "),
    );
  });

  it("supports backdrop sizes", () => {
    expect(tmdbSrcSet("https://image.tmdb.org/t/p/w780/b.jpg", ["w780", "w1280"])).toBe(
      "https://image.tmdb.org/t/p/w780/b.jpg 780w, https://image.tmdb.org/t/p/w1280/b.jpg 1280w",
    );
  });

  it("is undefined for non-TMDB and missing URLs", () => {
    expect(tmdbSrcSet("https://example.com/p.jpg")).toBeUndefined();
    expect(tmdbSrcSet(null)).toBeUndefined();
    expect(tmdbSrcSet(undefined)).toBeUndefined();
  });
});

describe("isTmdbImage", () => {
  it("recognises TMDB image URLs only", () => {
    expect(isTmdbImage(poster)).toBe(true);
    expect(isTmdbImage("https://image.tmdb.org.evil.com/t/p/w500/a.jpg")).toBe(false);
    expect(isTmdbImage(null)).toBe(false);
  });
});
