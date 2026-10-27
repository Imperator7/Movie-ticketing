export interface ShutdownSteps {
  /** Flip readiness to 503. */
  beginShutdown: () => void;
  drainMs: number;
  /** Close the app (stops the HTTP server, runs destroy hooks). */
  close: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * SIGTERM sequence: readiness -> 503, wait for the load balancer to notice (drain), then close.
 * Returns the ordered step names, which keeps the sequence testable.
 */
export async function gracefulShutdown(steps: ShutdownSteps): Promise<string[]> {
  const order: string[] = [];
  steps.beginShutdown();
  order.push("not-ready");
  await (steps.sleep ?? defaultSleep)(steps.drainMs);
  order.push("drained");
  await steps.close();
  order.push("closed");
  return order;
}
