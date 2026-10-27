/**
 * Estimates the offset between the server's clock and this device's clock from `Date` response
 * headers, so countdowns follow the server's deadlines even if the device clock is wrong.
 */
let skewMs = 0;

/** `Date` has one-second resolution (it is truncated), so assume the server was half a second later. */
const TRUNCATION_BIAS_MS = 500;

export function observeServerDate(header: string | null, sentAt: number, receivedAt: number): void {
  if (!header) return;
  const serverMs = Date.parse(header);
  if (Number.isNaN(serverMs)) return;
  const midpoint = (sentAt + receivedAt) / 2;
  skewMs = serverMs + TRUNCATION_BIAS_MS - midpoint;
}

/** Server time right now (ms since epoch). */
export function serverNow(): number {
  return Date.now() + skewMs;
}

export function getServerSkewMs(): number {
  return skewMs;
}

export function resetServerClock(): void {
  skewMs = 0;
}
