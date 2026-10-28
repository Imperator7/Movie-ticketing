import { delay, http, HttpResponse, type PathParams, type RequestHandler } from "msw";
import { getHealthMock } from "@/api/generated/endpoints/health/health.msw";
import { LoginBody, RegisterBody } from "@/api/generated/zod/auth/auth.zod";
import { cinemas, genres, movies } from "./catalog";
import { extraLatencyMs } from "./latency";
import { loadDb, saveDb, type MockDb, type MockUser } from "./db";
import * as service from "./service";
import { fail, type MockResult } from "./service";

/**
 * The mock API: MSW handlers over the stateful, contract-following service in ./service.
 * The same handlers serve the service worker and the in-process fallback.
 */

interface Ctx {
  db: MockDb;
  now: number;
  request: Request;
  params: PathParams;
  url: URL;
}

function toResponse(result: MockResult, now: number): Response {
  const headers: Record<string, string> = {
    // The web estimates its clock skew from this (checkout countdown).
    Date: new Date(now).toUTCString(),
    "X-Request-Id": crypto.randomUUID(),
    ...result.headers,
  };
  if (result.status === 204 || result.body === undefined) {
    return new HttpResponse(null, { status: result.status, headers });
  }
  return HttpResponse.json(result.body, { status: result.status, headers });
}

function route(
  method: "get" | "post",
  path: string,
  handler: (ctx: Ctx) => MockResult | Promise<MockResult>,
): RequestHandler {
  return http[method](path, async ({ request, params }) => {
    await delay(120 + extraLatencyMs());
    const db = loadDb();
    const now = Date.now();
    service.sweep(db, now);
    let result: MockResult;
    try {
      result = await handler({ db, now, request, params, url: new URL(request.url) });
    } catch {
      result = fail(500, "INTERNAL_ERROR", "Mock server error");
    }
    saveDb(db);
    return toResponse(result, now);
  });
}

function withUser(ctx: Ctx, run: (user: MockUser) => MockResult): MockResult {
  const user = service.authenticate(ctx.db, ctx.request.headers.get("Authorization"), ctx.now);
  return user ? run(user) : fail(401, "UNAUTHORIZED", "Missing or expired access token");
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const param = (ctx: Ctx, name: string) => String(ctx.params[name]);

export const handlers: RequestHandler[] = [
  // ---- catalog
  route("get", "*/genres", () => ({ status: 200, body: genres })),
  route("get", "*/cinemas", () => ({ status: 200, body: cinemas })),
  route("get", "*/movies", ({ url }) => {
    const status = url.searchParams.get("status");
    const genre = url.searchParams.get("genre");
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
    const filtered = movies
      .filter(
        (m) =>
          (!status || m.status === status) &&
          (!genre || m.genres.some((x) => x.slug === genre)) &&
          (!q || m.title.th.toLowerCase().includes(q) || m.title.en.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    return {
      status: 200,
      body: {
        page,
        pageSize,
        total: filtered.length,
        // MovieSummary only: the detail-only fields (backdrop, trailer, language) stay out of lists.
        items: filtered
          .slice((page - 1) * pageSize, page * pageSize)
          .map(({ originalLanguage: _l, backdropUrl: _b, trailerUrl: _t, ...summary }) => summary),
      },
    };
  }),
  route("get", "*/movies/:slug/showtimes", (ctx) => {
    const date = ctx.url.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return service.validationFailed([{ path: ["date"], code: "invalid_format" }]);
    }
    return service.getMovieShowtimes(
      ctx.db,
      param(ctx, "slug"),
      date,
      ctx.url.searchParams.get("cinemaId"),
      ctx.now,
    );
  }),
  route("get", "*/movies/:slug", (ctx) => {
    const movie = movies.find((m) => m.slug === param(ctx, "slug"));
    return movie ? { status: 200, body: movie } : fail(404, "NOT_FOUND", "Movie not found");
  }),
  route("get", "*/showtimes/:showtimeId/seats", (ctx) =>
    service.getSeatMap(ctx.db, param(ctx, "showtimeId"), ctx.now),
  ),
  route("get", "*/showtimes/:showtimeId", (ctx) =>
    service.getShowtimeDetail(param(ctx, "showtimeId"), ctx.now),
  ),

  // ---- auth
  route("post", "*/auth/login", async (ctx) => {
    const raw = await jsonBody(ctx.request);
    const parsed = LoginBody.safeParse(raw);
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      ...service.unknownKeyIssues(raw, ["email", "password"]),
    ];
    if (!parsed.success || issues.length > 0) return service.validationFailed(issues);
    return service.login(ctx.db, parsed.data, ctx.now);
  }),
  route("post", "*/auth/register", async (ctx) => {
    const raw = await jsonBody(ctx.request);
    const parsed = RegisterBody.safeParse(raw);
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      ...service.unknownKeyIssues(raw, [
        "email",
        "password",
        "displayName",
        "phone",
        "preferredLocale",
      ]),
    ];
    if (!parsed.success || issues.length > 0) return service.validationFailed(issues);
    return service.register(ctx.db, parsed.data, ctx.now);
  }),
  route("post", "*/auth/refresh", (ctx) => service.refresh(ctx.db, ctx.now)),
  route("post", "*/auth/logout", (ctx) => service.logout(ctx.db)),
  route("get", "*/auth/me", (ctx) =>
    withUser(ctx, (user) => ({ status: 200, body: service.toUser(user) })),
  ),

  // ---- bookings
  route("post", "*/bookings", async (ctx) => {
    const body = await jsonBody(ctx.request);
    return withUser(ctx, (user) =>
      service.createBooking(
        ctx.db,
        user,
        ctx.request.headers.get("Idempotency-Key"),
        body,
        ctx.now,
      ),
    );
  }),
  route("get", "*/bookings/active", (ctx) =>
    withUser(ctx, (user) => service.getActiveBooking(ctx.db, user)),
  ),
  route("get", "*/bookings/me", (ctx) =>
    withUser(ctx, (user) =>
      service.listMyBookings(
        ctx.db,
        user,
        ctx.url.searchParams.get("scope") === "past" ? "past" : "upcoming",
        Math.max(1, Number(ctx.url.searchParams.get("page") ?? 1)),
        Math.min(50, Math.max(1, Number(ctx.url.searchParams.get("pageSize") ?? 20))),
        ctx.now,
      ),
    ),
  ),
  route("post", "*/bookings/:bookingId/cancel", (ctx) =>
    withUser(ctx, (user) => service.cancelBooking(ctx.db, user, param(ctx, "bookingId"), ctx.now)),
  ),
  route("post", "*/bookings/:bookingId/payment-intent", (ctx) =>
    withUser(ctx, (user) =>
      service.createPaymentIntent(ctx.db, user, param(ctx, "bookingId"), ctx.now),
    ),
  ),
  route("get", "*/bookings/:bookingId", (ctx) =>
    withUser(ctx, (user) => service.getBooking(ctx.db, user, param(ctx, "bookingId"))),
  ),

  // ---- demo only: stands in for Stripe.js confirming the payment (and the webhook that follows)
  route("post", "*/__demo/pay", async (ctx) => {
    const body = await jsonBody(ctx.request);
    const method =
      typeof body === "object" && body !== null && "method" in body && body.method === "PROMPTPAY"
        ? "PROMPTPAY"
        : "CARD";
    const bookingId =
      typeof body === "object" && body !== null && "bookingId" in body
        ? String(body.bookingId)
        : "";
    return withUser(ctx, (user) => service.demoPay(ctx.db, user, { bookingId, method }, ctx.now));
  }),

  // ---- everything else (health, ...) falls back to the generated faker mocks
  ...getHealthMock(),
];
