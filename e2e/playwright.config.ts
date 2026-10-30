import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a RUNNING stack (they never start servers themselves):
 * - full Docker stack: `npm run stack:up`, then `npm run e2e` (web + API on http://localhost:8080)
 * - dev servers: E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:4000/api/v1 npm run e2e
 * The API must run with PAYMENTS_PROVIDER=fake (the demo pay button stands in for Stripe).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../reports/e2e" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
