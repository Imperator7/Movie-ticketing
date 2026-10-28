import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsPackage from "ajv-formats";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { IMPLEMENTED_OPERATIONS } from "../src/contract/implemented-operations.js";
import { addDays, bangkokDateOf, bangkokDayRange } from "../src/common/time/bangkok.js";
import { HealthService } from "../src/health/health.service.js";
import { createGenre, createHall, createMovie, createShowtime, token } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";

/**
 * Runtime conformance: calls the real API and validates what comes back against docs/openapi.yaml
 * (status documented, body schema, documented headers, Cache-Control and X-Request-Id rules).
 * With TEST_REPORT_DIR set it also writes conformance.json for scripts/test-report.mjs.
 */

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------- the spec

const SPEC_PATH = fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url));
const spec = parse(readFileSync(SPEC_PATH, "utf8")) as Obj;
const PREFIX = "/api/v1";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function resolveRef(ref: string): unknown {
  let current: unknown = spec;
  for (const part of ref.slice(2).split("/")) current = (current as Obj)[part];
  return current;
}

/** Inlines every `$ref` so the schema is self-contained for Ajv. */
function deref(node: unknown, depth = 0): unknown {
  if (depth > 40) throw new Error("circular $ref");
  if (Array.isArray(node)) return node.map((item) => deref(item, depth + 1));
  if (!isObj(node)) return node;
  if (typeof node.$ref === "string") return deref(resolveRef(node.$ref), depth + 1);
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, deref(value, depth + 1)]),
  );
}

interface SpecOperation {
  operationId: string;
  method: string;
  path: string;
  tag: string;
  responses: Obj;
}

function specOperations(): SpecOperation[] {
  const result: SpecOperation[] = [];
  for (const [route, item] of Object.entries(spec.paths as Obj)) {
    for (const method of HTTP_METHODS) {
      const operation = (item as Obj)[method];
      if (!isObj(operation)) continue;
      const tags = operation.tags as string[] | undefined;
      result.push({
        operationId: operation.operationId as string,
        method: method.toUpperCase(),
        path: route,
        tag: tags?.[0] ?? "",
        responses: operation.responses as Obj,
      });
    }
  }
  return result;
}

const OPERATIONS = specOperations();
const operationById = (id: string): SpecOperation => {
  const found = OPERATIONS.find((operation) => operation.operationId === id);
  if (!found) throw new Error(`Unknown operationId ${id}`);
  return found;
};

// ajv-formats is CommonJS: the default import is the plugin function.
const addFormats = addFormatsPackage as unknown as (instance: Ajv2020) => void;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();

function validatorFor(operationId: string, status: number): ValidateFunction | null {
  const key = `${operationId}:${String(status)}`;
  const cached = validators.get(key);
  if (cached) return cached;
  const response = deref(operationById(operationId).responses[String(status)]);
  const content = isObj(response) ? (response.content as Obj | undefined) : undefined;
  const schema = (content?.["application/json"] as Obj | undefined)?.schema;
  if (schema === undefined) return null;
  const validate = ajv.compile(schema as object);
  validators.set(key, validate);
  return validate;
}

// ---------------------------------------------------------------- checks

const CATALOG_OPERATIONS = new Set([
  "listGenres",
  "listCinemas",
  "listMovies",
  "getMovie",
  "listMovieShowtimes",
]);
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything the spec (and our caching notes) says about one response. Returns violations; [] = conforms. */
function conformance(
  operationId: string,
  res: Response,
  expected: number,
  undocumentedOk?: string,
): string[] {
  const errors: string[] = [];
  const documented = String(res.status) in operationById(operationId).responses;

  if (res.status !== expected)
    errors.push(`expected HTTP ${String(expected)}, got ${String(res.status)}`);
  if (!documented && undocumentedOk === undefined) {
    errors.push(`HTTP ${String(res.status)} is not documented for ${operationId} in the spec`);
  }

  // Body: against the documented schema (or, for a status the spec leaves out, the shared Error schema).
  const validate = documented
    ? validatorFor(operationId, res.status)
    : res.status >= 400
      ? ajv.compile(deref({ $ref: "#/components/schemas/Error" }) as object)
      : null;
  if (validate) {
    if (!(res.headers["content-type"] ?? "").includes("application/json")) {
      errors.push(
        `content-type is "${res.headers["content-type"] ?? "none"}", expected application/json`,
      );
    }
    if (!validate(res.body)) {
      for (const issue of validate.errors ?? []) {
        errors.push(
          `body${issue.instancePath} ${issue.message ?? "invalid"} ${JSON.stringify(issue.params)}`,
        );
      }
    }
  } else if (res.status === 204 || (documented && !validatorFor(operationId, res.status))) {
    if (res.text !== "") errors.push("a response without content must have an empty body");
  }

  // Documented headers (Set-Cookie on login/refresh/register): present, with every listed attribute.
  const responseSpec = deref(operationById(operationId).responses[String(res.status)]);
  const headerSpec = isObj(responseSpec) ? (responseSpec.headers as Obj | undefined) : undefined;
  for (const [name, definition] of Object.entries(headerSpec ?? {})) {
    const value = res.headers[name.toLowerCase()] as string | string[] | undefined;
    const joined = Array.isArray(value) ? value.join("\n") : (value ?? "");
    if (joined === "") {
      errors.push(`documented header ${name} is missing`);
      continue;
    }
    const example = /`([^`]+)`/.exec(
      (definition as { description?: string }).description ?? "",
    )?.[1];
    for (const attribute of example
      ?.split(";")
      .slice(1)
      .map((part) => part.trim()) ?? []) {
      if (attribute !== "" && !joined.toLowerCase().includes(attribute.toLowerCase())) {
        errors.push(`header ${name} lacks "${attribute}"`);
      }
    }
  }

  // Cache-Control: public only on successful catalog reads; everything else (errors, auth, health) no-store.
  const cacheControl = res.headers["cache-control"] ?? "";
  if (CATALOG_OPERATIONS.has(operationId) && res.status === 200) {
    if (!/^public, max-age=\d+, stale-while-revalidate=\d+$/.test(cacheControl)) {
      errors.push(`Cache-Control is "${cacheControl}", expected a public max-age policy`);
    }
  } else if (cacheControl !== "no-store") {
    errors.push(`Cache-Control is "${cacheControl}", expected no-store`);
  }

  // "Every response carries X-Request-Id".
  if (!UUID.test(res.headers["x-request-id"] ?? ""))
    errors.push("X-Request-Id is missing or not a UUID");

  return errors;
}

// ---------------------------------------------------------------- the cases

interface Case {
  operationId: string;
  name: string;
  label: () => string;
  expected: number;
  run: () => Promise<Response>;
  /** The status is real behaviour that the spec's `responses` omit: validated against Error, reported in the run. */
  undocumentedOk?: string;
  extra?: (res: Response) => string[];
}

interface Recorded {
  operationId: string;
  name: string;
  request: string;
  expectedStatus: number;
  actualStatus: number;
  status: "passed" | "failed";
  errors: string[];
}
const recorded: Recorded[] = [];

describe("OpenAPI conformance (what the running API returns vs docs/openapi.yaml)", () => {
  let app: NestExpressApplication;
  let shuttingDownApp: NestExpressApplication;
  let authLimitedApp: NestExpressApplication;
  let loginLimitedApp: NestExpressApplication;

  const ORIGIN = "http://localhost:3000";
  const PASSWORD = "correct-horse-battery";
  const email = `conf-${token()}@example.com`;
  let accessToken = "";
  let refreshToken = "";
  let staleRefreshToken = "";
  let movieSlug = "";
  let showtimeDate = "";
  let thaiTitleFragment = "";
  let showtimeId = "";
  let bookingToken = "";
  let bookingShowtimeId = "";
  let bookingSeatIds: string[] = [];
  let bookingId = "";

  const api = (target: NestExpressApplication = app): ReturnType<typeof request> =>
    request(target.getHttpServer());
  const cookieValue = (res: Response): string => {
    const lines = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    return (lines.find((line) => line.startsWith("rt=")) ?? "").split(";")[0]?.slice(3) ?? "";
  };

  beforeAll(async () => {
    app = await createTestApp();
    shuttingDownApp = await createTestApp();
    authLimitedApp = await createTestApp({ RATE_LIMIT_AUTH_PER_MIN: "2" });
    loginLimitedApp = await createTestApp({ RATE_LIMIT_LOGIN_PER_EMAIL_PER_MIN: "1" });

    // Minimal catalog fixtures: a movie with a genre, and two showtimes tomorrow in one hall.
    const genre = await createGenre();
    thaiTitleFragment = `ภาพยนตร์${token()}`;
    const movie = await createMovie({
      titleTh: thaiTitleFragment,
      genreIds: [genre.id],
      posterUrl: null,
    });
    movieSlug = movie.slug;
    showtimeDate = addDays(bangkokDateOf(new Date()), 1);
    const hall = await createHall();
    const day = bangkokDayRange(showtimeDate).start.getTime();
    showtimeId = (
      await createShowtime({
        movieId: movie.id,
        hallId: hall.hallId,
        startsAt: new Date(day + 10 * 3_600_000),
      })
    ).id;
    await createShowtime({
      movieId: movie.id,
      hallId: hall.hallId,
      startsAt: new Date(day + 14 * 3_600_000),
    });
    const bookingHall = await createHall();
    bookingSeatIds = bookingHall.seatIds;
    bookingShowtimeId = (
      await createShowtime({
        movieId: movie.id,
        hallId: bookingHall.hallId,
        startsAt: new Date(day + 18 * 3_600_000),
      })
    ).id;
    const registered = await request(app.getHttpServer())
      .post(`${PREFIX}/auth/register`)
      .send({
        email: `bk-${token()}@example.com`,
        password: "correct-horse-battery",
        displayName: "B",
      });
    bookingToken = (registered.body as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    await Promise.all(
      [app, shuttingDownApp, authLimitedApp, loginLimitedApp].map((a) => a.close()),
    );

    const dir = process.env.TEST_REPORT_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "conformance.json"),
        `${JSON.stringify(buildReport(), null, 2)}\n`,
      );
    }
  });

  const today = bangkokDateOf(new Date());
  const replayKey = randomUUID();
  const bookAuth = (method: "get" | "post", route: string): Promise<Response> =>
    api()[method](`${PREFIX}${route}`).set("Authorization", `Bearer ${bookingToken}`);
  const createBooking = (
    seatIds: string[],
    key: string = replayKey,
    showtime?: string,
  ): Promise<Response> =>
    api()
      .post(`${PREFIX}/bookings`)
      .set("Authorization", `Bearer ${bookingToken}`)
      .set("Idempotency-Key", key)
      .send({ showtimeId: showtime ?? bookingShowtimeId, seatIds });
  const freshEmail = (): string => `conf-${token()}@example.com`;
  const registerBody = (value: string): Obj => ({
    email: value,
    password: PASSWORD,
    displayName: "Conformance",
  });

  const cases: Case[] = [
    // ---------------------------------------------------------------- Health
    {
      operationId: "getLiveness",
      name: "200 alive",
      label: () => `GET ${PREFIX}/health/live`,
      expected: 200,
      run: () => api().get(`${PREFIX}/health/live`),
    },
    {
      operationId: "getReadiness",
      name: "200 ready (database up)",
      label: () => `GET ${PREFIX}/health/ready`,
      expected: 200,
      run: () => api().get(`${PREFIX}/health/ready`),
    },
    {
      operationId: "getReadiness",
      name: "503 shutting down (after SIGTERM)",
      label: () => `GET ${PREFIX}/health/ready`,
      expected: 503,
      run: () => {
        shuttingDownApp.get(HealthService).beginShutdown();
        return api(shuttingDownApp).get(`${PREFIX}/health/ready`);
      },
    },

    // ---------------------------------------------------------------- Auth (in flow order)
    {
      operationId: "register",
      name: "201 registers and sets the refresh cookie",
      label: () => `POST ${PREFIX}/auth/register`,
      expected: 201,
      run: () => api().post(`${PREFIX}/auth/register`).send(registerBody(email)),
      extra: (res) => {
        const body = res.body as { accessToken?: string };
        accessToken = body.accessToken ?? "";
        refreshToken = cookieValue(res);
        return [];
      },
    },
    {
      operationId: "register",
      name: "409 duplicate email",
      label: () => `POST ${PREFIX}/auth/register`,
      expected: 409,
      run: () => api().post(`${PREFIX}/auth/register`).send(registerBody(email)),
      extra: (res) =>
        (res.body as { code?: string }).code === "EMAIL_ALREADY_USED"
          ? []
          : ["code is not EMAIL_ALREADY_USED"],
    },
    {
      operationId: "register",
      name: "422 invalid email, short password, unknown key",
      label: () => `POST ${PREFIX}/auth/register`,
      expected: 422,
      run: () =>
        api()
          .post(`${PREFIX}/auth/register`)
          .send({ email: "nope", password: "short", displayName: "x", extra: 1 }),
      extra: (res) =>
        (res.body as { code?: string }).code === "VALIDATION_FAILED"
          ? []
          : ["code is not VALIDATION_FAILED"],
    },
    {
      operationId: "register",
      name: "429 rate limited",
      label: () => `POST ${PREFIX}/auth/register`,
      expected: 429,
      run: async () => {
        await api(authLimitedApp).post(`${PREFIX}/auth/register`).send(registerBody(freshEmail()));
        await api(authLimitedApp).post(`${PREFIX}/auth/register`).send(registerBody(freshEmail()));
        return api(authLimitedApp).post(`${PREFIX}/auth/register`).send(registerBody(freshEmail()));
      },
      extra: (res) => (res.headers["retry-after"] ? [] : ["Retry-After header is missing on 429"]),
    },
    {
      operationId: "login",
      name: "200 logs in and sets the refresh cookie",
      label: () => `POST ${PREFIX}/auth/login`,
      expected: 200,
      run: () => api().post(`${PREFIX}/auth/login`).send({ email, password: PASSWORD }),
      extra: (res) => {
        accessToken = (res.body as { accessToken: string }).accessToken;
        refreshToken = cookieValue(res);
        return [];
      },
    },
    {
      operationId: "login",
      name: "401 wrong password",
      label: () => `POST ${PREFIX}/auth/login`,
      expected: 401,
      run: () => api().post(`${PREFIX}/auth/login`).send({ email, password: "wrong-password" }),
      extra: (res) =>
        (res.body as { code?: string }).code === "INVALID_CREDENTIALS"
          ? []
          : ["code is not INVALID_CREDENTIALS"],
    },
    {
      operationId: "login",
      name: "422 missing password",
      label: () => `POST ${PREFIX}/auth/login`,
      expected: 422,
      run: () => api().post(`${PREFIX}/auth/login`).send({ email }),
    },
    {
      operationId: "login",
      name: "429 rate limited per email",
      label: () => `POST ${PREFIX}/auth/login`,
      expected: 429,
      run: async () => {
        const body = { email: freshEmail(), password: "wrong-password" };
        await api(loginLimitedApp).post(`${PREFIX}/auth/login`).send(body);
        return api(loginLimitedApp).post(`${PREFIX}/auth/login`).send(body);
      },
      extra: (res) => (res.headers["retry-after"] ? [] : ["Retry-After header is missing on 429"]),
    },
    {
      operationId: "getMe",
      name: "200 current user",
      label: () => `GET ${PREFIX}/auth/me`,
      expected: 200,
      run: () => api().get(`${PREFIX}/auth/me`).set("Authorization", `Bearer ${accessToken}`),
    },
    {
      operationId: "getMe",
      name: "401 without a token",
      label: () => `GET ${PREFIX}/auth/me`,
      expected: 401,
      run: () => api().get(`${PREFIX}/auth/me`),
      extra: (res) =>
        (res.body as { code?: string }).code === "UNAUTHORIZED" ? [] : ["code is not UNAUTHORIZED"],
    },
    {
      operationId: "getMe",
      name: "401 with a bad token",
      label: () => `GET ${PREFIX}/auth/me`,
      expected: 401,
      run: () => api().get(`${PREFIX}/auth/me`).set("Authorization", "Bearer not.a.jwt"),
    },
    {
      operationId: "refresh",
      name: "200 rotates the cookie",
      label: () => `POST ${PREFIX}/auth/refresh`,
      expected: 200,
      run: () =>
        api()
          .post(`${PREFIX}/auth/refresh`)
          .set("Origin", ORIGIN)
          .set("Cookie", `rt=${refreshToken}`),
      extra: (res) => {
        staleRefreshToken = refreshToken;
        refreshToken = cookieValue(res);
        accessToken = (res.body as { accessToken: string }).accessToken;
        return refreshToken !== "" && refreshToken !== staleRefreshToken
          ? []
          : ["the refresh cookie was not rotated"];
      },
    },
    {
      operationId: "refresh",
      name: "401 without a cookie",
      label: () => `POST ${PREFIX}/auth/refresh`,
      expected: 401,
      run: () => api().post(`${PREFIX}/auth/refresh`).set("Origin", ORIGIN),
      extra: (res) =>
        (res.body as { code?: string }).code === "REFRESH_TOKEN_INVALID"
          ? []
          : ["code is not REFRESH_TOKEN_INVALID"],
    },
    {
      operationId: "refresh",
      name: "403 foreign Origin",
      label: () => `POST ${PREFIX}/auth/refresh`,
      expected: 403,
      run: () =>
        api()
          .post(`${PREFIX}/auth/refresh`)
          .set("Origin", "https://evil.example.com")
          .set("Cookie", `rt=${refreshToken}`),
      extra: (res) =>
        (res.body as { code?: string }).code === "FORBIDDEN" ? [] : ["code is not FORBIDDEN"],
    },
    {
      operationId: "refresh",
      name: "401 reused (already rotated) token",
      label: () => `POST ${PREFIX}/auth/refresh`,
      expected: 401,
      run: () =>
        api()
          .post(`${PREFIX}/auth/refresh`)
          .set("Origin", ORIGIN)
          .set("Cookie", `rt=${staleRefreshToken}`),
    },
    {
      operationId: "logout",
      name: "204 without a cookie (already logged out)",
      label: () => `POST ${PREFIX}/auth/logout`,
      expected: 204,
      run: () => api().post(`${PREFIX}/auth/logout`).set("Origin", ORIGIN),
    },
    {
      operationId: "logout",
      name: "403 foreign Origin",
      label: () => `POST ${PREFIX}/auth/logout`,
      expected: 403,
      run: () => api().post(`${PREFIX}/auth/logout`).set("Origin", "https://evil.example.com"),
      extra: (res) =>
        (res.body as { code?: string }).code === "FORBIDDEN" ? [] : ["code is not FORBIDDEN"],
    },
    {
      operationId: "logout",
      name: "204 revokes the token and clears the cookie",
      label: () => `POST ${PREFIX}/auth/logout`,
      expected: 204,
      run: () =>
        api()
          .post(`${PREFIX}/auth/logout`)
          .set("Origin", ORIGIN)
          .set("Cookie", `rt=${refreshToken}`),
      extra: (res) => {
        const cleared = ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find(
          (l) => l.startsWith("rt="),
        );
        return cleared?.includes("Expires=Thu, 01 Jan 1970")
          ? []
          : ["the rt cookie was not cleared"];
      },
    },

    // ---------------------------------------------------------------- Catalog
    {
      operationId: "listGenres",
      name: "200 all genres",
      label: () => `GET ${PREFIX}/genres`,
      expected: 200,
      run: () => api().get(`${PREFIX}/genres`),
      extra: (res) =>
        Array.isArray(res.body) && res.body.length > 0 ? [] : ["expected at least one genre"],
    },
    {
      operationId: "listCinemas",
      name: "200 all cinemas",
      label: () => `GET ${PREFIX}/cinemas`,
      expected: 200,
      run: () => api().get(`${PREFIX}/cinemas`),
      extra: (res) =>
        Array.isArray(res.body) && res.body.length > 0 ? [] : ["expected at least one cinema"],
    },
    {
      operationId: "listMovies",
      name: "200 default page",
      label: () => `GET ${PREFIX}/movies`,
      expected: 200,
      run: () => api().get(`${PREFIX}/movies`),
    },
    {
      operationId: "listMovies",
      name: "200 Thai search with paging",
      label: () => `GET ${PREFIX}/movies?q=${thaiTitleFragment}&pageSize=1&page=1`,
      expected: 200,
      run: () =>
        api().get(`${PREFIX}/movies`).query({ q: thaiTitleFragment, pageSize: 1, page: 1 }),
      extra: (res) =>
        (res.body as { total?: number }).total === 1
          ? []
          : ["Thai search should find exactly the fixture movie"],
    },
    {
      operationId: "listMovies",
      name: "200 status + genre filter with no match",
      label: () => `GET ${PREFIX}/movies?status=ENDED&genre=no-such-genre`,
      expected: 200,
      run: () => api().get(`${PREFIX}/movies`).query({ status: "ENDED", genre: "no-such-genre" }),
    },
    {
      operationId: "listMovies",
      name: "422 pageSize too big",
      label: () => `GET ${PREFIX}/movies?pageSize=99`,
      expected: 422,
      run: () => api().get(`${PREFIX}/movies`).query({ pageSize: 99 }),
      extra: (res) =>
        (res.body as { code?: string }).code === "VALIDATION_FAILED"
          ? []
          : ["code is not VALIDATION_FAILED"],
    },
    {
      operationId: "getMovie",
      name: "200 movie detail",
      label: () => `GET ${PREFIX}/movies/${movieSlug}`,
      expected: 200,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}`),
    },
    {
      operationId: "getMovie",
      name: "404 unknown slug",
      label: () => `GET ${PREFIX}/movies/no-such-movie`,
      expected: 404,
      run: () => api().get(`${PREFIX}/movies/no-such-movie`),
      extra: (res) =>
        (res.body as { code?: string }).code === "NOT_FOUND" ? [] : ["code is not NOT_FOUND"],
    },
    {
      operationId: "listMovieShowtimes",
      name: "200 a day with showtimes",
      label: () => `GET ${PREFIX}/movies/${movieSlug}/showtimes?date=${showtimeDate}`,
      expected: 200,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}/showtimes`).query({ date: showtimeDate }),
      extra: (res) => {
        const body = res.body as { cinemas: { showtimes: unknown[] }[]; availableDates: string[] };
        return body.cinemas[0]?.showtimes.length === 2 && body.availableDates.includes(showtimeDate)
          ? []
          : ["expected the 2 fixture showtimes and the date in availableDates"];
      },
    },
    {
      operationId: "listMovieShowtimes",
      name: "200 a day without showtimes",
      label: () => `GET ${PREFIX}/movies/${movieSlug}/showtimes?date=${today}`,
      expected: 200,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}/showtimes`).query({ date: today }),
    },
    {
      operationId: "listMovieShowtimes",
      name: "404 unknown movie",
      label: () => `GET ${PREFIX}/movies/no-such-movie/showtimes?date=${showtimeDate}`,
      expected: 404,
      run: () =>
        api().get(`${PREFIX}/movies/no-such-movie/showtimes`).query({ date: showtimeDate }),
    },
    {
      operationId: "listMovieShowtimes",
      name: "422 missing date",
      label: () => `GET ${PREFIX}/movies/${movieSlug}/showtimes`,
      expected: 422,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}/showtimes`),
    },
    {
      operationId: "listMovieShowtimes",
      name: "422 date outside the allowed window",
      label: () => `GET ${PREFIX}/movies/${movieSlug}/showtimes?date=1999-01-01`,
      expected: 422,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}/showtimes`).query({ date: "1999-01-01" }),
    },
    {
      operationId: "listMovieShowtimes",
      name: "404 malformed slug",
      label: () => `GET ${PREFIX}/movies/Bad_Slug/showtimes?date=${showtimeDate}`,
      expected: 404,
      run: () => api().get(`${PREFIX}/movies/Bad_Slug/showtimes`).query({ date: showtimeDate }),
    },
    {
      operationId: "listMovieShowtimes",
      name: "422 impossible date",
      label: () => `GET ${PREFIX}/movies/${movieSlug}/showtimes?date=2026-02-30`,
      expected: 422,
      run: () => api().get(`${PREFIX}/movies/${movieSlug}/showtimes`).query({ date: "2026-02-30" }),
    },

    // ---------------------------------------------------------------- Showtimes
    {
      operationId: "getShowtime",
      name: "200 showtime detail",
      label: () => `GET ${PREFIX}/showtimes/${showtimeId}`,
      expected: 200,
      run: () => api().get(`${PREFIX}/showtimes/${showtimeId}`),
    },
    {
      operationId: "getShowtime",
      name: "404 unknown / malformed id",
      label: () => `GET ${PREFIX}/showtimes/not-a-uuid`,
      expected: 404,
      run: () => api().get(`${PREFIX}/showtimes/not-a-uuid`),
    },
    {
      operationId: "getSeatMap",
      name: "200 live seat map",
      label: () => `GET ${PREFIX}/showtimes/${showtimeId}/seats`,
      expected: 200,
      run: () => api().get(`${PREFIX}/showtimes/${showtimeId}/seats`),
      extra: (res) =>
        (res.body as { seats: unknown[] }).seats.length === 10
          ? []
          : ["expected the 10 fixture seats"],
    },
    {
      operationId: "getSeatMap",
      name: "404 unknown showtime",
      label: () => `GET ${PREFIX}/showtimes/${NIL_UUID}/seats`,
      expected: 404,
      run: () => api().get(`${PREFIX}/showtimes/${NIL_UUID}/seats`),
    },

    // ---------------------------------------------------------------- Bookings (in lifecycle order)
    {
      operationId: "getActiveBooking",
      name: "204 none yet",
      label: () => `GET ${PREFIX}/bookings/active`,
      expected: 204,
      run: () => bookAuth("get", "/bookings/active"),
    },
    {
      operationId: "getActiveBooking",
      name: "401 without a token",
      label: () => `GET ${PREFIX}/bookings/active`,
      expected: 401,
      run: () => api().get(`${PREFIX}/bookings/active`),
    },
    {
      operationId: "createBooking",
      name: "201 locks seats",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 201,
      run: () => createBooking(bookingSeatIds.slice(0, 2)),
      extra: (res) => {
        bookingId = (res.body as { id: string }).id;
        return (res.body as { totalBaht: number }).totalBaht === 440
          ? []
          : ["totalBaht should be 2 x 220"];
      },
    },
    {
      operationId: "createBooking",
      name: "201 replay with the same Idempotency-Key",
      label: () => `POST ${PREFIX}/bookings (replay)`,
      expected: 201,
      run: () => createBooking(bookingSeatIds.slice(0, 2), replayKey),
      extra: (res) =>
        res.headers["idempotent-replayed"] === "true" ? [] : ["Idempotent-Replayed header missing"],
    },
    {
      operationId: "createBooking",
      name: "409 a booking is already in progress",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 409,
      run: () => createBooking(bookingSeatIds.slice(5, 6), randomUUID()),
      extra: (res) =>
        (res.body as { code?: string }).code === "ACTIVE_BOOKING_EXISTS"
          ? []
          : ["code is not ACTIVE_BOOKING_EXISTS"],
    },
    {
      operationId: "createBooking",
      name: "401 without a token",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 401,
      run: () =>
        api()
          .post(`${PREFIX}/bookings`)
          .set("Idempotency-Key", randomUUID())
          .send({ showtimeId: bookingShowtimeId, seatIds: bookingSeatIds.slice(0, 1) }),
    },
    {
      operationId: "createBooking",
      name: "404 unknown showtime",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 404,
      run: () => createBooking(bookingSeatIds.slice(0, 1), randomUUID(), NIL_UUID),
      extra: (res) =>
        (res.body as { code?: string }).code === "SHOWTIME_NOT_FOUND"
          ? []
          : ["code is not SHOWTIME_NOT_FOUND"],
    },
    {
      operationId: "createBooking",
      name: "422 no seats",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 422,
      run: () => createBooking([]),
    },
    {
      operationId: "createBooking",
      name: "422 too many seats",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 422,
      run: () => createBooking(bookingSeatIds.slice(0, 5), randomUUID()),
      extra: (res) =>
        (res.body as { code?: string }).code === "TOO_MANY_SEATS"
          ? []
          : ["code is not TOO_MANY_SEATS"],
    },
    {
      operationId: "createBooking",
      name: "422 same key, different body",
      label: () => `POST ${PREFIX}/bookings`,
      expected: 422,
      run: () => createBooking(bookingSeatIds.slice(3, 4), replayKey),
      extra: (res) =>
        (res.body as { code?: string }).code === "IDEMPOTENCY_KEY_REUSED"
          ? []
          : ["code is not IDEMPOTENCY_KEY_REUSED"],
    },
    {
      operationId: "getActiveBooking",
      name: "200 the booking in progress",
      label: () => `GET ${PREFIX}/bookings/active`,
      expected: 200,
      run: () => bookAuth("get", "/bookings/active"),
    },
    {
      operationId: "getBooking",
      name: "200 own booking",
      label: () => `GET ${PREFIX}/bookings/${bookingId}`,
      expected: 200,
      run: () => bookAuth("get", `/bookings/${bookingId}`),
    },
    {
      operationId: "getBooking",
      name: "401 without a token",
      label: () => `GET ${PREFIX}/bookings/${bookingId}`,
      expected: 401,
      run: () => api().get(`${PREFIX}/bookings/${bookingId}`),
    },
    {
      operationId: "getBooking",
      name: "404 unknown id",
      label: () => `GET ${PREFIX}/bookings/${NIL_UUID}`,
      expected: 404,
      run: () => bookAuth("get", `/bookings/${NIL_UUID}`),
    },
    {
      operationId: "listMyBookings",
      name: "200 upcoming (default)",
      label: () => `GET ${PREFIX}/bookings/me`,
      expected: 200,
      run: () => bookAuth("get", "/bookings/me"),
    },
    {
      operationId: "listMyBookings",
      name: "200 past scope with paging",
      label: () => `GET ${PREFIX}/bookings/me?scope=past&page=1&pageSize=5`,
      expected: 200,
      run: () => bookAuth("get", "/bookings/me?scope=past&page=1&pageSize=5"),
    },
    {
      operationId: "listMyBookings",
      name: "401 without a token",
      label: () => `GET ${PREFIX}/bookings/me`,
      expected: 401,
      run: () => api().get(`${PREFIX}/bookings/me`),
    },
    {
      operationId: "listMyBookings",
      name: "422 bad scope (spec lists no 422)",
      label: () => `GET ${PREFIX}/bookings/me?scope=future`,
      expected: 422,
      undocumentedOk: "the spec lists no 422 for listMyBookings, but the query is strict",
      run: () => bookAuth("get", "/bookings/me?scope=future"),
    },
    {
      operationId: "cancelBooking",
      name: "401 without a token",
      label: () => `POST ${PREFIX}/bookings/${bookingId}/cancel`,
      expected: 401,
      run: () => api().post(`${PREFIX}/bookings/${bookingId}/cancel`),
    },
    {
      operationId: "cancelBooking",
      name: "404 unknown id",
      label: () => `POST ${PREFIX}/bookings/${NIL_UUID}/cancel`,
      expected: 404,
      run: () => bookAuth("post", `/bookings/${NIL_UUID}/cancel`),
    },
    {
      operationId: "cancelBooking",
      name: "200 cancels a pending booking",
      label: () => `POST ${PREFIX}/bookings/${bookingId}/cancel`,
      expected: 200,
      run: () => bookAuth("post", `/bookings/${bookingId}/cancel`),
      extra: (res) =>
        (res.body as { status?: string; cancelReason?: string }).cancelReason === "USER_CANCELLED"
          ? []
          : ["cancelReason is not USER_CANCELLED"],
    },
    {
      operationId: "cancelBooking",
      name: "409 already cancelled",
      label: () => `POST ${PREFIX}/bookings/${bookingId}/cancel`,
      expected: 409,
      run: () => bookAuth("post", `/bookings/${bookingId}/cancel`),
      extra: (res) =>
        (res.body as { code?: string }).code === "BOOKING_NOT_PENDING"
          ? []
          : ["code is not BOOKING_NOT_PENDING"],
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.operationId}: ${testCase.name}`, async () => {
      let actual = 0;
      let errors: string[];
      try {
        const res = await testCase.run();
        actual = res.status;
        errors = [
          ...conformance(testCase.operationId, res, testCase.expected, testCase.undocumentedOk),
          ...(testCase.extra?.(res) ?? []),
        ];
      } catch (error) {
        errors = [`request failed: ${error instanceof Error ? error.message : String(error)}`];
      }
      recorded.push({
        operationId: testCase.operationId,
        name: testCase.name,
        request: testCase.label(),
        expectedStatus: testCase.expected,
        actualStatus: actual,
        status: errors.length === 0 ? "passed" : "failed",
        errors,
      });
      expect(errors).toEqual([]);
    });
  }

  it("the validator itself rejects bodies that break the spec (so a green run means something)", () => {
    const genres = validatorFor("listGenres", 200);
    const page = validatorFor("listMovies", 200);
    const error = validatorFor("getMovie", 404);

    expect(genres?.([{ id: "1", slug: "a", name: { th: "ก" } }])).toBe(false);
    expect(genres?.([{ id: 1, slug: "a", name: { th: "ก", en: "A" } }])).toBe(true);
    expect(page?.({ page: 1, pageSize: 20, total: 0 })).toBe(false); // items missing
    expect(error?.({ statusCode: 404, code: "NOT_A_CODE", message: "x" })).toBe(false);
    expect(error?.({ statusCode: 404, code: "NOT_FOUND", message: "x" })).toBe(true);
    expect(ajv.compile({ type: "string", format: "uuid" })("not-a-uuid")).toBe(false);
    expect(ajv.compile({ type: ["string", "null"], format: "uri" })(null)).toBe(true);
  });

  it("covers every documented response status of every implemented operation", () => {
    const missing: string[] = [];
    for (const id of IMPLEMENTED_OPERATIONS) {
      const covered = new Set(cases.filter((c) => c.operationId === id).map((c) => c.expected));
      for (const status of Object.keys(operationById(id).responses)) {
        if (!covered.has(Number(status))) missing.push(`${id} ${status}`);
      }
      if (!cases.some((c) => c.operationId === id)) missing.push(`${id}: no cases at all`);
    }
    expect(missing).toEqual([]);
  });

  it("has a case for every implemented operation and no case for an unknown one", () => {
    const ids = new Set(cases.map((c) => c.operationId));
    for (const id of ids) expect(OPERATIONS.map((o) => o.operationId)).toContain(id);
    for (const id of IMPLEMENTED_OPERATIONS) expect(ids).toContain(id);
  });
});

// ---------------------------------------------------------------- report

function buildReport(): Obj {
  const info = spec.info as Obj;
  return {
    specVersion: String(info.version),
    operations: OPERATIONS.map((operation) => {
      const implemented = (IMPLEMENTED_OPERATIONS as readonly string[]).includes(
        operation.operationId,
      );
      const checks = recorded
        .filter((entry) => entry.operationId === operation.operationId)
        .map(({ operationId: _operationId, ...check }) => check);
      const failed = checks.some((check) => check.status === "failed");
      return {
        operationId: operation.operationId,
        method: operation.method,
        path: operation.path,
        tag: operation.tag,
        implemented,
        status: !implemented || checks.length === 0 ? "skipped" : failed ? "failed" : "passed",
        checks,
      };
    }),
  };
}
