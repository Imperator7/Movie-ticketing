import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const API_URL = process.env.E2E_API_URL ?? `${BASE_URL}/api/v1`;

interface Seat {
  label: string;
  status: string;
}

/** A showtime with at least `count` free seats, a few days ahead so booking is open. */
async function freeSeats(api: APIRequestContext, count: number) {
  const movies = (await (await api.get(`${API_URL}/movies?pageSize=50`)).json()) as {
    items: { slug: string }[];
  };
  // Today in Bangkok (the API's day boundary).
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  for (const movie of movies.items) {
    const first = (await (
      await api.get(`${API_URL}/movies/${movie.slug}/showtimes?date=${today}`)
    ).json()) as { availableDates?: string[] };
    for (const date of (first.availableDates ?? []).slice(1, 4)) {
      const day = (await (
        await api.get(`${API_URL}/movies/${movie.slug}/showtimes?date=${date}`)
      ).json()) as { cinemas: { showtimes: { id: string }[] }[] };
      for (const showtime of day.cinemas.flatMap((c) => c.showtimes)) {
        const map = (await (await api.get(`${API_URL}/showtimes/${showtime.id}/seats`)).json()) as {
          seats: Seat[];
        };
        // Random free seats, so reruns and the two projects do not collide.
        const free = map.seats
          .filter((s) => s.status === "AVAILABLE")
          .sort(() => Math.random() - 0.5)
          .slice(0, count);
        if (free.length === count)
          return { showtimeId: showtime.id, labels: free.map((s) => s.label) };
      }
    }
  }
  throw new Error("no showtime with free seats");
}

/** A fresh user, logged in through the API: the refresh cookie lands in the browser context. */
async function loggedInUser(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "e2e-long-password";
  // Register answers with a session; its refresh cookie lands in this page's context.
  const headers = { Origin: new URL(BASE_URL).origin };
  const register = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, displayName: "E2E" },
    headers,
  });
  expect(register.status()).toBe(201);
}

async function bookSeats(page: Page, locale: "th" | "en", count: number) {
  const show = await freeSeats(page.request, count);
  await page.goto(`/${locale}/showtime?id=${show.showtimeId}&seats=${show.labels.join(",")}`);
  await page.getByRole("button", { name: /Buy tickets|ซื้อตั๋ว/ }).click();
  await expect(page).toHaveURL(/\/checkout\?bookingId=/);
  return show;
}

// One user per project, one browser page for the whole journey: the API rate-limits auth (10/min).
test.describe.configure({ mode: "serial" });

test.describe("customer journey", () => {
  let page: Page;

  test("a guest is sent to log in before buying", async ({ browser }) => {
    const guest = await browser.newPage();
    const show = await freeSeats(guest.request, 1);
    await guest.goto(`/en/showtime?id=${show.showtimeId}&seats=${show.labels.join(",")}`);
    await guest.getByRole("button", { name: "Buy tickets" }).click();
    await expect(guest).toHaveURL(/\/en\/login\?next=/);
    await guest.close();
  });

  test("browse -> seats -> pay by card -> ticket -> my bookings (English)", async ({ browser }) => {
    page = await browser.newPage();
    await loggedInUser(page);
    await page.goto("/en");
    await expect(page.getByRole("link", { name: /Movies/ }).first()).toBeVisible();

    const show = await bookSeats(page, "en", 2);
    for (const label of show.labels) await expect(page.getByText(label).first()).toBeVisible();
    await page.getByRole("button", { name: /^Pay/ }).click();

    await expect(page).toHaveURL(/\/checkout\/complete/);
    await expect(page.getByText("You're all set")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/MT-[A-Z0-9]{6}/).first()).toBeVisible();

    await page.goto("/en/bookings");
    await expect(page.getByText("Confirmed").first()).toBeVisible();
  });

  test("pay by PromptPay (Thai)", async () => {
    await bookSeats(page, "th", 1);
    await page.getByRole("tab", { name: "PromptPay" }).click();
    await page.getByRole("button", { name: "จำลองการสแกนและชำระเงิน" }).click();
    await expect(page.getByText("จองสำเร็จ")).toBeVisible({ timeout: 15_000 });
  });

  test("cancelling at checkout releases the seats", async () => {
    const show = await bookSeats(page, "en", 1);
    await page.getByRole("button", { name: "Cancel booking" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
    await expect(page).toHaveURL(/\/showtime\?id=/);

    const map = (await (
      await page.request.get(`${API_URL}/showtimes/${show.showtimeId}/seats`)
    ).json()) as { seats: Seat[] };
    const label = show.labels[0];
    expect(map.seats.find((s) => s.label === label)?.status).toBe("AVAILABLE");
    await page.close();
  });
});
