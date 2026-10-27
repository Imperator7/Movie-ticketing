import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MovieDetail, SeatMap, MovieShowtimes } from "@/api/generated/model";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const API = "http://localhost/api/v1";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
  server.close();
});

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  return (await response.json()) as T;
}

describe("MSW handlers", () => {
  it("serves realistic bilingual movies and filters by status", async () => {
    const page = await get<{ total: number; items: MovieDetail[] }>("/movies?status=NOW_SHOWING");
    expect(page.total).toBe(3);
    for (const movie of page.items) {
      expect(movie.title.th).toMatch(/[฀-๿]/);
      expect(movie.title.en).toMatch(/^[\x20-\x7e]+$/);
      expect(movie.status).toBe("NOW_SHOWING");
    }
  });

  it("returns a seat map with whole-baht prices and an aisle", async () => {
    const showtimes = await get<MovieShowtimes>("/movies/dune-part-two/showtimes?date=2026-11-05");
    const slot = showtimes.cinemas[0]?.showtimes[0];
    expect(slot).toBeDefined();
    const map = await get<SeatMap>(`/showtimes/${slot?.id ?? ""}/seats`);

    expect(map.seats).toHaveLength(8 * 14);
    expect(map.prices.every((p) => Number.isInteger(p.priceBaht))).toBe(true);
    const row = map.seats.filter((s) => s.row === "A").map((s) => s.gridCol);
    expect(row).toContain(6);
    expect(row).not.toContain(7); // aisle after the 7th seat
    expect(new Set(map.seats.map((s) => s.id)).size).toBe(map.seats.length);
    expect(map.seats.some((s) => s.status === "BOOKED")).toBe(true);
    expect(map.seats.some((s) => s.type === "PREMIUM")).toBe(true);
  });

  it("answers unknown movies with the Error schema", async () => {
    const response = await fetch(`${API}/movies/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("refresh is 401 until a login happens", async () => {
    const before = await fetch(`${API}/auth/refresh`, { method: "POST" });
    expect(before.status).toBe(401);
    await fetch(`${API}/auth/login`, { method: "POST", body: "{}" });
    const after = await fetch(`${API}/auth/refresh`, { method: "POST" });
    expect(after.status).toBe(200);
  });
});
