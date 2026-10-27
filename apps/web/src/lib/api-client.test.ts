import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/api/generated/model";
import { useAuthStore } from "@/features/auth/store";
import { ApiError, apiClient } from "./api-client";

const user: User = {
  id: "u1",
  displayName: "Somchai",
  preferredLocale: "th",
  loginMethods: ["PASSWORD"],
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const unauthorized = () =>
  json(401, { statusCode: 401, code: "UNAUTHORIZED", message: "Missing access token" });

const refreshed = (accessToken = "new-token") => json(200, { accessToken, expiresIn: 900, user });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function calls(path: string) {
  return fetchMock.mock.calls.filter(([url]) => urlOf(url).endsWith(path));
}

function headersOf(call: Parameters<typeof fetch> | undefined): Headers {
  return new Headers(call?.[1]?.headers);
}

beforeEach(() => {
  useAuthStore.getState().clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient", () => {
  it("uses the base URL, credentials, a request id and no bearer for guests", async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ id: 1 }]));
    const res = await apiClient<{ data: unknown; status: number }>("/genres", { method: "GET" });

    expect(res).toMatchObject({ data: [{ id: 1 }], status: 200 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/genres");
    expect(init?.credentials).toBe("include");
    const headers = headersOf(fetchMock.mock.calls[0]);
    expect(headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends a different request id per request", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, {})));
    await apiClient("/genres");
    await apiClient("/genres");
    const ids = fetchMock.mock.calls.map((c) => headersOf(c).get("X-Request-Id"));
    expect(new Set(ids).size).toBe(2);
  });

  it("attaches the bearer token from the auth store", async () => {
    useAuthStore.getState().setSession({ accessToken: "abc", user });
    fetchMock.mockResolvedValueOnce(json(200, user));
    await apiClient("/auth/me");
    expect(headersOf(fetchMock.mock.calls[0]).get("Authorization")).toBe("Bearer abc");
  });

  it("maps an error response to ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        409,
        {
          statusCode: 409,
          code: "SEAT_TAKEN",
          message: "Seat A5 was just taken",
          details: { seatIds: ["s1"] },
        },
        { "X-Request-Id": "req-123" },
      ),
    );
    const error = await apiClient("/bookings", { method: "POST" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "SEAT_TAKEN",
      message: "Seat A5 was just taken",
      details: { seatIds: ["s1"] },
      requestId: "req-123",
    });
  });

  it("falls back to INTERNAL_ERROR for a non-JSON error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(apiClient("/movies")).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL_ERROR",
    });
  });

  it("returns undefined data for 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiClient("/auth/logout", { method: "POST" })).resolves.toMatchObject({
      data: undefined,
      status: 204,
    });
  });

  describe("401 handling", () => {
    it("refreshes once, stores the new session and retries with the new token", async () => {
      useAuthStore.getState().setSession({ accessToken: "old", user });
      fetchMock
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(refreshed("fresh"))
        .mockResolvedValueOnce(json(200, { ok: true }));

      const res = await apiClient<{ data: unknown }>("/bookings/active");

      expect(res.data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(calls("/auth/refresh")).toHaveLength(1);
      expect(calls("/auth/refresh")[0]?.[1]?.method).toBe("POST");
      expect(headersOf(fetchMock.mock.calls[2]).get("Authorization")).toBe("Bearer fresh");
      expect(useAuthStore.getState().accessToken).toBe("fresh");
    });

    it("shares one refresh between concurrent 401s (single-flight)", async () => {
      useAuthStore.getState().setSession({ accessToken: "old", user });
      let refreshCalls = 0;
      fetchMock.mockImplementation((input, init) => {
        const url = urlOf(input);
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          return Promise.resolve(refreshed("fresh"));
        }
        const bearer = new Headers(init?.headers).get("Authorization");
        return Promise.resolve(bearer === "Bearer fresh" ? json(200, { ok: url }) : unauthorized());
      });

      const [a, b] = await Promise.all([apiClient("/bookings/active"), apiClient("/bookings/me")]);

      expect(refreshCalls).toBe(1);
      expect(a).toMatchObject({ status: 200 });
      expect(b).toMatchObject({ status: 200 });
    });

    it("retries only once: a second 401 is surfaced as ApiError", async () => {
      fetchMock
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(refreshed())
        .mockResolvedValueOnce(unauthorized());

      await expect(apiClient("/bookings/active")).rejects.toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("clears the session when the refresh fails", async () => {
      useAuthStore.getState().setSession({ accessToken: "old", user });
      fetchMock
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(
          json(401, { statusCode: 401, code: "REFRESH_TOKEN_INVALID", message: "expired" }),
        );

      await expect(apiClient("/bookings/active")).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it("does not try to refresh for login failures", async () => {
      fetchMock.mockResolvedValueOnce(
        json(401, { statusCode: 401, code: "INVALID_CREDENTIALS", message: "bad" }),
      );
      await expect(apiClient("/auth/login", { method: "POST" })).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("allows a new refresh after a previous one finished", async () => {
      fetchMock
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(refreshed("one"))
        .mockResolvedValueOnce(json(200, {}))
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(refreshed("two"))
        .mockResolvedValueOnce(json(200, {}));
      await apiClient("/bookings/active");
      await apiClient("/bookings/active");
      expect(calls("/auth/refresh")).toHaveLength(2);
      expect(useAuthStore.getState().accessToken).toBe("two");
    });
  });
});
