import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetail, MovieShowtimes } from "@/api/generated/model";
import { bangkokDate } from "@/lib/format";
import { renderWithIntl } from "@/test/intl";
import { MovieView } from "./movie-view";

const replace = vi.fn();
const push = vi.fn();
let search = "slug=clayface";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ replace, push }),
}));
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof NextIntl>()),
  useLocale: () => "en",
}));
import type * as NextIntl from "next-intl";

const movie: MovieDetail = {
  id: "m1",
  slug: "clayface",
  title: { th: "เคลย์เฟซ", en: "Clayface" },
  synopsis: { th: "เรื่องย่อ", en: "A synopsis." },
  durationMin: 109,
  rating: "AGE_15",
  releaseDate: "2026-10-19",
  posterUrl: null,
  backdropUrl: null,
  trailerUrl: null,
  status: "NOW_SHOWING",
  originalLanguage: "en",
  genres: [{ id: 1, slug: "horror", name: { th: "สยองขวัญ", en: "Horror" } }],
};

const cinema = {
  id: "c1",
  name: { th: "สตาร์ไลท์", en: "Starlight Cinema" },
  address: { th: "ที่อยู่", en: "1 Rama I Road" },
  city: "Bangkok",
};

const slot = (id: string, startsAt: string, seatsLeft: number, fromPriceBaht = 220) => ({
  id,
  startsAt,
  format: "TWO_D" as const,
  audioLanguage: "EN",
  subtitleLanguage: "TH",
  hallNumber: 2,
  hallType: "STANDARD" as const,
  fromPriceBaht,
  seatsLeft,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let showtimesFor: (date: string) => MovieShowtimes;
let movieStatus = 200;
let dates: string[] = [];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <MovieView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost/api/v1");
  replace.mockReset();
  push.mockReset();
  search = "slug=clayface";
  movieStatus = 200;
  dates = [];
  showtimesFor = (date) => ({ movieId: "m1", date, availableDates: dates, cinemas: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/showtimes")) {
        return Promise.resolve(json(showtimesFor(new URL(url).searchParams.get("date") ?? "")));
      }
      return Promise.resolve(
        movieStatus === 200
          ? json(movie)
          : json({ statusCode: movieStatus, code: "NOT_FOUND", message: "x" }, movieStatus),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("MovieView against the catalog API shape", () => {
  const today = bangkokDate(Date.now());

  it("asks for today first, then jumps to availableDates[0] when today has no showtimes", async () => {
    dates = ["2099-01-02", "2099-01-03"];
    renderView();
    await screen.findByRole("heading", { name: "Clayface" });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/movie?slug=clayface&date=2099-01-02", {
        scroll: false,
      });
    });
    const asked = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => (typeof input === "string" ? input : ""));
    expect(asked.some((u) => u.includes(`date=${today}`))).toBe(true);
  });

  it("does not move when today has showtimes", async () => {
    dates = [today, "2099-01-03"];
    renderView();
    await screen.findByRole("heading", { name: "Clayface" });
    await screen.findAllByRole("button", { name: /\d/ });
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows 'no showtimes yet' (and no date strip) when availableDates is empty", async () => {
    dates = [];
    renderView();
    expect(await screen.findByText("No showtimes yet")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Show dates" })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("for a coming-soon movie without showtimes, explains it is not open for booking", async () => {
    movie.status = "COMING_SOON";
    dates = [];
    renderView();
    expect(await screen.findByText("This movie is not open for booking yet.")).toBeInTheDocument();
    movie.status = "NOW_SHOWING";
  });

  it("lists showtimes grouped by cinema with hall, from-price, few-seats hint and sold out", async () => {
    dates = [today];
    showtimesFor = (date) => ({
      movieId: "m1",
      date,
      availableDates: dates,
      cinemas: [
        {
          cinema,
          showtimes: [
            slot("s1", "2099-01-01T05:40:00.000Z", 120, 350),
            slot("s2", "2099-01-01T08:00:00.000Z", 6),
            slot("s3", "2099-01-01T11:00:00.000Z", 0),
          ],
        },
      ],
    });
    renderView();
    expect(await screen.findByRole("heading", { name: "Starlight Cinema" })).toBeInTheDocument();
    expect(screen.getByText("12:40")).toBeInTheDocument(); // 05:40Z is Bangkok time + 7 h
    expect(screen.getByText("Hall 2 · from ฿350")).toBeInTheDocument();
    expect(screen.getByText("6 left")).toBeInTheDocument();
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12:40/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Sold out/ })).toBeDisabled();
  });

  it("a 404 from the API shows the not-found state with a retry", async () => {
    movieStatus = 404;
    renderView();
    expect(await screen.findByText("We could not find this movie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
