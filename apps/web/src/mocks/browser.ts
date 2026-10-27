import { getResponse } from "msw";
import { setupWorker } from "msw/browser";
import { setTransport } from "@/lib/transport";
import { handlers } from "./handlers";

/** How long to wait for the service worker before falling back to in-process mocking. */
const WORKER_TIMEOUT_MS = 2_500;

function startWorker(): Promise<unknown> {
  if (!("serviceWorker" in navigator)) return Promise.reject(new Error("no service workers"));
  const start = setupWorker(...handlers).start({ onUnhandledRequest: "bypass", quiet: true });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("service worker did not start in time"));
    }, WORKER_TIMEOUT_MS);
  });
  return Promise.race([start, timeout]);
}

/**
 * Starts API mocking. Prefers the MSW service worker; when it can't run (an embedded browser,
 * blocked or slow service workers) requests are resolved in-process by the very same handlers.
 * Only imported (dynamically) in development with NEXT_PUBLIC_API_MOCKING=enabled.
 */
export async function startMocking(): Promise<void> {
  try {
    await startWorker();
    return;
  } catch (error) {
    console.warn("[mocks] service worker unavailable, resolving API calls in-process", error);
  }
  setTransport(async (request) => {
    const response = await getResponse(handlers, request);
    return (
      response ??
      new Response(JSON.stringify({ statusCode: 404, code: "NOT_FOUND", message: "No mock" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
}
