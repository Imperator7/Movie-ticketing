import { http, HttpResponse, delay, type RequestHandler } from "msw";
import { getAuthMock } from "@/api/generated/endpoints/auth/auth.msw";
import { getBookingsMock } from "@/api/generated/endpoints/bookings/bookings.msw";
import { getCatalogMock } from "@/api/generated/endpoints/catalog/catalog.msw";
import { getHealthMock } from "@/api/generated/endpoints/health/health.msw";
import { getPaymentsMock } from "@/api/generated/endpoints/payments/payments.msw";
import { getShowtimesMock } from "@/api/generated/endpoints/showtimes/showtimes.msw";
import type { ErrorCode, Error as ApiErrorBody } from "@/api/generated/model";
import {
  buildMovieShowtimes,
  buildSeatMap,
  buildShowtimeDetail,
  cinemas,
  demoUser,
  genres,
  movies,
} from "./data";

function error(statusCode: number, code: ErrorCode, message: string) {
  const body: ApiErrorBody = { statusCode, code, message };
  return HttpResponse.json(body, { status: statusCode });
}

function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

// The httpOnly refresh cookie cannot be set from MSW, so "logged in" is remembered here.
let loggedIn = false;
const session = () => ({ accessToken: "mock-access-token", expiresIn: 900, user: demoUser });

/**
 * Hand-written handlers with realistic data. They come first, so they take precedence over the
 * generated faker mocks (random strings), which remain as a fallback for every other endpoint.
 */
const realistic: RequestHandler[] = [
  http.get("*/genres", async () => {
    await delay(150);
    return HttpResponse.json(genres);
  }),
  http.get("*/cinemas", async () => {
    await delay(150);
    return HttpResponse.json(cinemas);
  }),
  http.get("*/movies", async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const genre = url.searchParams.get("genre");
    const q = url.searchParams.get("q")?.toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? 20));
    const filtered = movies.filter(
      (m) =>
        (!status || m.status === status) &&
        (!genre || m.genres.some((x) => x.slug === genre)) &&
        (!q || m.title.th.toLowerCase().includes(q) || m.title.en.toLowerCase().includes(q)),
    );
    return HttpResponse.json({
      page,
      pageSize,
      total: filtered.length,
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
    });
  }),
  http.get("*/movies/:slug/showtimes", async ({ params, request }) => {
    await delay(150);
    const movie = movies.find((m) => m.slug === params.slug);
    if (!movie) return error(404, "NOT_FOUND", "Movie not found");
    const date = new URL(request.url).searchParams.get("date") ?? bangkokToday();
    return HttpResponse.json(buildMovieShowtimes(movie, date));
  }),
  http.get("*/movies/:slug", async ({ params }) => {
    await delay(150);
    const movie = movies.find((m) => m.slug === params.slug);
    return movie ? HttpResponse.json(movie) : error(404, "NOT_FOUND", "Movie not found");
  }),
  http.get("*/showtimes/:showtimeId/seats", async ({ params }) => {
    await delay(150);
    const id = String(params.showtimeId);
    return buildShowtimeDetail(id)
      ? HttpResponse.json(buildSeatMap(id))
      : error(404, "SHOWTIME_NOT_FOUND", "Showtime not found");
  }),
  http.get("*/showtimes/:showtimeId", async ({ params }) => {
    await delay(150);
    const detail = buildShowtimeDetail(String(params.showtimeId));
    return detail
      ? HttpResponse.json(detail)
      : error(404, "SHOWTIME_NOT_FOUND", "Showtime not found");
  }),
  http.post("*/auth/login", async () => {
    await delay(300);
    loggedIn = true;
    return HttpResponse.json(session());
  }),
  http.post("*/auth/register", async () => {
    await delay(300);
    loggedIn = true;
    return HttpResponse.json(session(), { status: 201 });
  }),
  http.post("*/auth/refresh", async () => {
    await delay(100);
    return loggedIn
      ? HttpResponse.json(session())
      : error(401, "REFRESH_TOKEN_INVALID", "Refresh token is missing or invalid");
  }),
  http.post("*/auth/logout", () => {
    loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/auth/me", ({ request }) =>
    request.headers.get("Authorization")
      ? HttpResponse.json(demoUser)
      : error(401, "UNAUTHORIZED", "Missing access token"),
  ),
];

export const handlers: RequestHandler[] = [
  ...realistic,
  ...getAuthMock(),
  ...getBookingsMock(),
  ...getCatalogMock(),
  ...getHealthMock(),
  ...getPaymentsMock(),
  ...getShowtimesMock(),
];
