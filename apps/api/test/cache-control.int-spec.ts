import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, bangkokDateOf } from "../src/common/time/bangkok.js";
import { createMovie } from "./catalog-fixtures.js";
import { createTestApp } from "./create-test-app.js";

const CATALOG = "public, max-age=60, stale-while-revalidate=300";
const SHOWTIMES = "public, max-age=15, stale-while-revalidate=60";

describe("Cache-Control", () => {
  let app: NestExpressApplication;
  let slug: string;
  const date = addDays(bangkokDateOf(new Date()), 1);
  const get = (path: string): ReturnType<ReturnType<typeof request>["get"]> =>
    request(app.getHttpServer()).get(`/api/v1${path}`);

  beforeAll(async () => {
    app = await createTestApp();
    slug = (await createMovie()).slug;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ["listGenres", "/genres", CATALOG],
    ["listCinemas", "/cinemas", CATALOG],
    ["listMovies", "/movies", CATALOG],
    ["getMovie", "/movies/SLUG", CATALOG],
    ["listMovieShowtimes", "/movies/SLUG/showtimes?date=DATE", SHOWTIMES],
  ])("%s is publicly cacheable", async (_name, path, expected) => {
    const res = await get(path.replace("SLUG", slug).replace("DATE", date));

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(expected);
  });

  it.each([
    ["404 on a cacheable route", "/movies/does-not-exist", 404],
    ["422 on a cacheable route", "/movies?pageSize=999", 422],
    ["422 on showtimes", "/movies/SLUG/showtimes", 422],
    ["401 on /auth/me", "/auth/me", 401],
    ["unknown route", "/nope", 404],
  ])("keeps no-store for %s", async (_name, path, status) => {
    const res = await get(path.replace("SLUG", slug));

    expect(res.status).toBe(status);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("keeps no-store for health and for auth responses", async () => {
    const health = await get("/health/ready");
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });

    expect(health.headers["cache-control"]).toBe("no-store");
    expect(login.status).toBe(401);
    expect(login.headers["cache-control"]).toBe("no-store");
  });

  it("keeps no-store on a successful register response (tokens must never be cached)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `cache-${slug}@example.com`, password: "long-enough-pw", displayName: "C" });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
