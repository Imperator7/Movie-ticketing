import { describe, expect, it } from "vitest";
import { getCancelBookingUrl, getGetBookingUrl } from "./generated/endpoints/bookings/bookings";
import { getGetMovieUrl, getListMovieShowtimesUrl } from "./generated/endpoints/catalog/catalog";
import { getGetSeatMapUrl, getGetShowtimeUrl } from "./generated/endpoints/showtimes/showtimes";

// Path params come from page URLs (`?slug=`, `?id=`). orval's `urlEncodeParameters` must keep a crafted value
// like `../auth/me` inside its own path segment, or the browser would normalise it into another endpoint
// called with the user's bearer token (client-side path traversal).
const hostile = "../auth/me?x=1#y";
const encoded = "..%2Fauth%2Fme%3Fx%3D1%23y";

describe("generated API paths encode path params", () => {
  it.each([
    ["getMovie", getGetMovieUrl(hostile), `/movies/${encoded}`],
    [
      "listMovieShowtimes",
      getListMovieShowtimesUrl(hostile, { date: "2026-10-28" }),
      `/movies/${encoded}/showtimes?date=2026-10-28`,
    ],
    ["getShowtime", getGetShowtimeUrl(hostile), `/showtimes/${encoded}`],
    ["getSeatMap", getGetSeatMapUrl(hostile), `/showtimes/${encoded}/seats`],
    ["getBooking", getGetBookingUrl(hostile), `/bookings/${encoded}`],
    ["cancelBooking", getCancelBookingUrl(hostile), `/bookings/${encoded}/cancel`],
  ])("%s", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("still resolves to the intended endpoint after URL normalisation", () => {
    const url = new URL(`/api/v1${getGetMovieUrl("../auth/me")}`, "https://example.test");
    expect(url.pathname).toBe("/api/v1/movies/..%2Fauth%2Fme");
  });
});
