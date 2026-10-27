import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/api/generated/model";
import { useAuthStore } from "@/features/auth/store";
import { createSessionRefresher, type LockManagerLike } from "./api-client";

const user: User = {
  id: "u1",
  displayName: "Somchai",
  preferredLocale: "th",
  loginMethods: ["PASSWORD"],
};

/** A stand-in for `navigator.locks`: callers queue and run one at a time, shared by "tabs". */
function fakeLocks(): LockManagerLike & { log: string[] } {
  let tail: Promise<unknown> = Promise.resolve();
  const log: string[] = [];
  return {
    log,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        log.push(`acquire ${name}`);
        try {
          return await callback();
        } finally {
          log.push(`release ${name}`);
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

const ok = (token: string) =>
  new Response(JSON.stringify({ accessToken: token, expiresIn: 900, user }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const invalid = () =>
  new Response(
    JSON.stringify({ statusCode: 401, code: "REFRESH_TOKEN_INVALID", message: "invalid" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  useAuthStore.getState().clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cross-tab refresh with Web Locks", () => {
  it("serializes refreshes from two tabs: the second one runs after the first finished", async () => {
    const locks = fakeLocks();
    const tabA = createSessionRefresher(() => locks);
    const tabB = createSessionRefresher(() => locks);

    // A server with one rotating cookie: a refresh with a stale cookie is rejected.
    let cookie = "rt-1";
    let running = 0;
    let maxRunning = 0;
    const seenCookies: string[] = [];
    fetchMock.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      const sent = cookie;
      seenCookies.push(sent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (sent !== cookie) return invalid();
      cookie = `rt-${(Number(sent.slice(3)) + 1).toString()}`;
      return ok(`token-for-${sent}`);
    });

    const [a, b] = await Promise.all([tabA(), tabB()]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(maxRunning).toBe(1);
    // The waiting tab sent the cookie rotated by the first one.
    expect(seenCookies).toEqual(["rt-1", "rt-2"]);
    expect(locks.log).toEqual([
      "acquire auth-refresh",
      "release auth-refresh",
      "acquire auth-refresh",
      "release auth-refresh",
    ]);
  });

  it("without the lock the same two tabs would overlap (the problem the lock solves)", async () => {
    const tabA = createSessionRefresher(() => undefined);
    const tabB = createSessionRefresher(() => undefined);
    let running = 0;
    let maxRunning = 0;
    fetchMock.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return ok("t");
    });
    await Promise.all([tabA(), tabB()]);
    expect(maxRunning).toBe(2);
  });

  it("shares one in-tab flight, so one tab takes the lock once", async () => {
    const locks = fakeLocks();
    const tab = createSessionRefresher(() => locks);
    fetchMock.mockImplementation(() => Promise.resolve(ok("t")));
    await Promise.all([tab(), tab(), tab()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(locks.log.filter((l) => l.startsWith("acquire"))).toHaveLength(1);
  });
});

describe("REFRESH_TOKEN_INVALID retry", () => {
  it("retries once (taking the lock again) and succeeds without clearing the session", async () => {
    const locks = fakeLocks();
    const refresh = createSessionRefresher(() => locks);
    useAuthStore.getState().setSession({ accessToken: "old", user });
    fetchMock.mockResolvedValueOnce(invalid()).mockResolvedValueOnce(ok("fresh"));

    await expect(refresh()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(locks.log.filter((l) => l.startsWith("acquire"))).toHaveLength(2);
    expect(useAuthStore.getState().accessToken).toBe("fresh");
  });

  it("retries only once, then clears the session", async () => {
    const refresh = createSessionRefresher(() => fakeLocks());
    useAuthStore.getState().setSession({ accessToken: "old", user });
    fetchMock.mockImplementation(() => Promise.resolve(invalid()));

    await expect(refresh()).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("does not retry other failures (e.g. a server error)", async () => {
    const refresh = createSessionRefresher(() => fakeLocks());
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    await expect(refresh()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("works without navigator.locks (falls back to the in-tab single-flight)", async () => {
    const refresh = createSessionRefresher(() => undefined);
    fetchMock.mockResolvedValueOnce(invalid()).mockResolvedValueOnce(ok("fresh"));
    await expect(refresh()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
