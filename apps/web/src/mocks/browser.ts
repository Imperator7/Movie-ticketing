import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Browser MSW worker. Only imported (dynamically) in development with NEXT_PUBLIC_API_MOCKING=enabled. */
export async function startMocking(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass" });
}
