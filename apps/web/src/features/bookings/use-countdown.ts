import { useSyncExternalStore } from "react";
import { serverNow } from "@/lib/server-clock";

/** Milliseconds until an ISO deadline, measured on the server's clock. */
export function msUntil(expiresAtIso: string, now: number = serverNow()): number {
  return Date.parse(expiresAtIso) - now;
}

const TICK_MS = 250;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  return () => {
    clearInterval(timer);
  };
}

/** Server time, rounded down to the tick, so React only re-renders when the clock really moved. */
function snapshot(): number {
  return Math.floor(serverNow() / TICK_MS) * TICK_MS;
}

/**
 * Time left until `expiresAtIso`, following the server's clock (estimated from `Date` headers),
 * so the 5:00 payment window is right even when the device clock is off. `null` without a deadline.
 */
export function useCountdown(expiresAtIso: string | undefined): number | null {
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  return expiresAtIso ? msUntil(expiresAtIso, now) : null;
}
