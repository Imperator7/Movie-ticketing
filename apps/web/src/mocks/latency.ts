/** Extra latency added to every mock response (the demo control "Slow network"). */
export const SLOW_NETWORK_MS = 1_500;

const STORAGE_KEY = "movie-ticketing:mock-slow-network";
let slow: boolean | null = null;

export function isSlowNetwork(): boolean {
  if (slow !== null) return slow;
  try {
    slow = sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    slow = false;
  }
  return slow;
}

export function setSlowNetwork(value: boolean): void {
  slow = value;
  try {
    sessionStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // The in-memory flag still applies for this page load.
  }
}

export function extraLatencyMs(): number {
  return isSlowNetwork() ? SLOW_NETWORK_MS : 0;
}
