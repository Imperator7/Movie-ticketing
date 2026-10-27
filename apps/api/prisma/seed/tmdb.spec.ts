import { describe, expect, it, vi } from "vitest";
import { moviesFileSchema } from "./schema.js";
import {
  readableForThai,
  TmdbClient,
  fetchSeedMovies,
  finalizeMovies,
  isV4Token,
  mapRating,
  mapTmdbMovie,
  mapWithConcurrency,
  slugify,
  type TmdbDetails,
} from "./tmdb.js";

function details(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    id: 693134,
    title: "Dune: Part Two",
    overview: "Paul Atreides unites with the Fremen.",
    runtime: 166,
    release_date: "2024-02-27",
    original_language: "en",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    adult: false,
    genres: [{ id: 878, name: "Science Fiction" }],
    release_dates: { results: [] },
    videos: { results: [] },
    ...overrides,
  };
}

const withCert = (country: string, certification: string): Partial<TmdbDetails> => ({
  release_dates: { results: [{ iso_3166_1: country, release_dates: [{ certification }] }] },
});

describe("mapRating", () => {
  it.each([
    ["ส", "PROMOTED"],
    ["ท", "GENERAL"],
    ["น13+", "AGE_13"],
    ["น15+", "AGE_15"],
    ["น18+", "AGE_18"],
    ["ฉ20-", "AGE_20"],
    ["13", "AGE_13"],
    ["18+", "AGE_18"],
    [" น 15+ ", "AGE_15"],
  ])("maps the Thai certification %j to %s", (cert, expected) => {
    expect(mapRating(details(withCert("TH", cert)))).toBe(expected);
  });

  it("prefers the Thai certification over the US one", () => {
    const both = details({
      release_dates: {
        results: [
          { iso_3166_1: "US", release_dates: [{ certification: "R" }] },
          { iso_3166_1: "TH", release_dates: [{ certification: "ท" }] },
        ],
      },
    });

    expect(mapRating(both)).toBe("GENERAL");
  });

  it("skips empty Thai entries and uses the first non-empty one", () => {
    const d = details({
      release_dates: {
        results: [
          { iso_3166_1: "TH", release_dates: [{ certification: "" }, { certification: "น15+" }] },
        ],
      },
    });

    expect(mapRating(d)).toBe("AGE_15");
  });

  it.each([
    ["G", "GENERAL"],
    ["PG", "AGE_13"],
    ["PG-13", "AGE_13"],
    ["R", "AGE_18"],
    ["NC-17", "AGE_20"],
  ])("falls back to the US rating %s -> %s", (cert, expected) => {
    expect(mapRating(details(withCert("US", cert)))).toBe(expected);
  });

  it("falls back to AGE_18 for adult films and AGE_13 when nothing is known", () => {
    expect(mapRating(details({ adult: true }))).toBe("AGE_18");
    expect(mapRating(details())).toBe("AGE_13");
    expect(mapRating(details(withCert("TH", "weird")))).toBe("AGE_13");
  });
});

describe("mapTmdbMovie", () => {
  const th = details({
    title: "ดูน ภาคสอง",
    overview: "พอลร่วมมือกับเฟรเมน",
    genres: [{ id: 878, name: "ไซไฟ" }],
  });
  const en = details({
    ...withCert("TH", "น13+"),
    videos: {
      results: [
        { key: "teaser1", site: "YouTube", type: "Teaser" },
        { key: "vimeo1", site: "Vimeo", type: "Trailer" },
        { key: "abc123", site: "YouTube", type: "Trailer" },
        { key: "later", site: "YouTube", type: "Trailer" },
      ],
    },
  });

  it("maps title, runtime, rating, genres and full image URLs", () => {
    const movie = mapTmdbMovie(th, en, "NOW_SHOWING");

    expect(movie).toMatchObject({
      tmdbId: 693134,
      slug: "dune-part-two",
      titleTh: "ดูน ภาคสอง",
      titleEn: "Dune: Part Two",
      synopsisTh: "พอลร่วมมือกับเฟรเมน",
      synopsisEn: "Paul Atreides unites with the Fremen.",
      durationMin: 166,
      rating: "AGE_13",
      originalLanguage: "en",
      releaseDate: "2024-02-27",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      status: "NOW_SHOWING",
      genres: [{ tmdbId: 878, slug: "science-fiction", nameTh: "ไซไฟ", nameEn: "Science Fiction" }],
    });
  });

  it("uses the first YouTube trailer only", () => {
    expect(mapTmdbMovie(th, en, "NOW_SHOWING")?.trailerUrl).toBe(
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(mapTmdbMovie(th, details(), "NOW_SHOWING")?.trailerUrl).toBeNull();
  });

  it("falls back to English when the Thai overview and title are empty", () => {
    const movie = mapTmdbMovie(
      details({ title: "", overview: "  ", genres: [] }),
      en,
      "COMING_SOON",
    );

    expect(movie?.titleTh).toBe("Dune: Part Two");
    expect(movie?.synopsisTh).toBe("Paul Atreides unites with the Fremen.");
    expect(movie?.genres[0]?.nameTh).toBe("Science Fiction"); // no Thai genre name either
    expect(movie?.status).toBe("COMING_SOON");
  });

  it("uses the Thai text for English when the English overview is empty, and the title as a last resort", () => {
    const movie = mapTmdbMovie(th, details({ overview: "" }), "NOW_SHOWING");
    expect(movie?.synopsisEn).toBe("พอลร่วมมือกับเฟรเมน");

    const bare = mapTmdbMovie(
      details({ overview: null }),
      details({ overview: null }),
      "NOW_SHOWING",
    );
    expect(bare?.synopsisEn).toBe("Dune: Part Two");
  });

  it("returns null posters when TMDB has none in either language", () => {
    const none = { poster_path: null, backdrop_path: null };
    const movie = mapTmdbMovie(details(none), details(none), "NOW_SHOWING");

    expect(movie?.posterUrl).toBeNull();
    expect(movie?.backdropUrl).toBeNull();
  });

  it("takes the Thai poster when the English one is missing", () => {
    const movie = mapTmdbMovie(th, details({ poster_path: null }), "NOW_SHOWING");

    expect(movie?.posterUrl).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });

  it("rounds runtime and skips movies without runtime, release date or title", () => {
    expect(mapTmdbMovie(th, details({ runtime: 99.6 }), "NOW_SHOWING")?.durationMin).toBe(100);
    const noRuntime = { runtime: 0 };
    expect(mapTmdbMovie(details(noRuntime), details(noRuntime), "NOW_SHOWING")).toBeNull();
    const noDate = { release_date: "" };
    expect(mapTmdbMovie(details(noDate), details(noDate), "NOW_SHOWING")).toBeNull();
    const noTitle = { title: "" };
    expect(mapTmdbMovie(details(noTitle), details(noTitle), "NOW_SHOWING")).toBeNull();
  });

  it("produces output that satisfies the movies.json schema", () => {
    const movie = mapTmdbMovie(th, en, "NOW_SHOWING");

    expect(moviesFileSchema.safeParse({ movies: [movie] }).success).toBe(true);
  });
});

describe("readableForThai", () => {
  it("keeps Thai and Latin titles", () => {
    expect(readableForThai("อเวนเจอร์ส: เผด็จศึก")).toBe("อเวนเจอร์ส: เผด็จศึก");
    expect(readableForThai("Street Fighter")).toBe("Street Fighter");
    expect(readableForThai("พี่บึ้ก… โคตรคน ชนนรก")).toBe("พี่บึ้ก… โคตรคน ชนนรก");
  });

  it("treats other scripts (TMDB's original-title fallback) as missing", () => {
    expect(readableForThai("欢迎来龙餐馆")).toBeUndefined();
    expect(readableForThai("रामायणम")).toBeUndefined();
    expect(readableForThai("Ramayana: रामायणम")).toBeUndefined();
  });

  it("treats empty text as missing and keeps digit-only titles", () => {
    expect(readableForThai("  ")).toBeUndefined();
    expect(readableForThai(null)).toBeUndefined();
    expect(readableForThai("1917")).toBe("1917");
  });
});

describe("slugify / finalizeMovies", () => {
  it("makes lowercase hyphenated ASCII slugs", () => {
    expect(slugify("Dune: Part Two")).toBe("dune-part-two");
    expect(slugify("Amélie & Friends!")).toBe("amelie-and-friends");
    expect(slugify("ท้องฟ้า")).toBe("");
  });

  it("sorts by slug and disambiguates duplicate slugs with the TMDB id", () => {
    const base = mapTmdbMovie(details(), details(), "NOW_SHOWING");
    if (!base) throw new Error("fixture");
    const result = finalizeMovies([
      { ...base, tmdbId: 20, slug: "zebra" },
      { ...base, tmdbId: 11, slug: "same" },
      { ...base, tmdbId: 12, slug: "same" },
    ]);

    expect(result.map((m) => m.slug)).toEqual(["same", "same-12", "zebra"]);
  });
});

describe("TmdbClient", () => {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers });

  it("detects v4 tokens and v3 keys", () => {
    expect(isV4Token("eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe(true);
    expect(isV4Token("0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("sends a v4 token as a Bearer header and a v3 key as api_key", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({ results: [] })));
    await new TmdbClient({ apiKey: "eyJtoken.x.y", fetchImpl }).get("/movie/now_playing", {
      region: "TH",
    });
    await new TmdbClient({ apiKey: "0123456789abcdef0123456789abcdef", fetchImpl }).get("/x", {});

    const [v4Url, v4Init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect((v4Init.headers as Record<string, string>).authorization).toBe("Bearer eyJtoken.x.y");
    expect(v4Url.searchParams.get("api_key")).toBeNull();
    expect(v4Url.searchParams.get("region")).toBe("TH");
    const [v3Url, v3Init] = fetchImpl.mock.calls[1] as unknown as [URL, RequestInit];
    expect(v3Url.searchParams.get("api_key")).toBe("0123456789abcdef0123456789abcdef");
    expect((v3Init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("retries a 429 after Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    const body = await new TmdbClient({ apiKey: "k", fetchImpl, sleep }).get("/x", {});

    expect(body).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("backs off exponentially without Retry-After and gives up after maxRetries", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({}, 429)));
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    await expect(
      new TmdbClient({ apiKey: "k", fetchImpl, sleep, maxRetries: 2 }).get("/x", {}),
    ).rejects.toThrow("HTTP 429");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([500, 1000]);
  });

  it("does not retry other client errors", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({}, 401)));

    await expect(new TmdbClient({ apiKey: "bad", fetchImpl }).get("/x", {})).rejects.toThrow(
      "HTTP 401",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps result order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return n * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("fetchSeedMovies (mocked fetch)", () => {
  it("fetches now playing + upcoming in both languages and returns sorted, schema-valid movies", async () => {
    const detailBody = (id: number, language: string): unknown => ({
      id,
      title: language === "th-TH" ? `หนัง ${String(id)}` : `Movie ${String(id)}`,
      overview: language === "th-TH" ? "" : "Overview",
      runtime: 100 + id,
      release_date: "2026-10-01",
      original_language: "en",
      poster_path: `/p${String(id)}.jpg`,
      backdrop_path: null,
      genres: [{ id: 28, name: language === "th-TH" ? "แอ็กชัน" : "Action" }],
      release_dates: {
        results: [{ iso_3166_1: "TH", release_dates: [{ certification: "น15+" }] }],
      },
      videos: { results: [] },
    });
    const fetchImpl = vi.fn((input: URL | string) => {
      const url = new URL(input.toString());
      if (url.pathname === "/3/movie/now_playing")
        return Promise.resolve(Response.json({ results: [{ id: 2 }, { id: 1 }] }));
      if (url.pathname === "/3/movie/upcoming")
        return Promise.resolve(Response.json({ results: [{ id: 2 }, { id: 3 }] }));
      const id = Number(url.pathname.split("/").pop());
      return Promise.resolve(Response.json(detailBody(id, url.searchParams.get("language") ?? "")));
    }) as unknown as typeof fetch;

    const movies = await fetchSeedMovies(new TmdbClient({ apiKey: "k", fetchImpl }));

    expect(movies.map((m) => [m.slug, m.status])).toEqual([
      ["movie-1", "NOW_SHOWING"],
      ["movie-2", "NOW_SHOWING"], // also in upcoming, kept once as now playing
      ["movie-3", "COMING_SOON"],
    ]);
    expect(movies[0]).toMatchObject({
      rating: "AGE_15",
      titleTh: "หนัง 1",
      synopsisTh: "Overview",
    });
    expect(moviesFileSchema.safeParse({ movies }).success).toBe(true);
    // 2 lists + 3 movies x 2 languages.
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(8);
  });
});
