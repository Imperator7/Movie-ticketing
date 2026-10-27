/**
 * How the api-client sends requests. By default it is the global `fetch`. In mock mode without a
 * service worker, the mock server installs an in-process transport (see src/mocks/browser.ts).
 */
export type Transport = (request: Request) => Promise<Response>;

let transport: Transport | null = null;

export function setTransport(next: Transport | null): void {
  transport = next;
}

export function send(url: string, init: RequestInit): Promise<Response> {
  if (!transport) return fetch(url, init);
  return transport(new Request(new URL(url, window.location.origin), init));
}
