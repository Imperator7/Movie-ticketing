import { ErrorCode, type AuthResponse } from "@/api/generated/model";
import { useAuthStore } from "@/features/auth/store";
import { observeServerDate } from "./server-clock";
import { send as transportSend } from "./transport";

const DEFAULT_BASE_URL = "/api/v1";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL;
}

/** Parsed `Error` schema from the API (docs/openapi.yaml). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(init: {
    status: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ERROR_CODES: ReadonlySet<string> = new Set<string>(Object.values(ErrorCode));

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toApiError(response: Response, body: unknown, requestId: string): ApiError {
  const fallback: ErrorCode =
    response.status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.INTERNAL_ERROR;
  const record = isRecord(body) ? body : {};
  return new ApiError({
    status: response.status,
    code: isErrorCode(record.code) ? record.code : fallback,
    message: typeof record.message === "string" ? record.message : response.statusText,
    details: isRecord(record.details) ? record.details : undefined,
    requestId: response.headers.get("X-Request-Id") ?? requestId,
  });
}

function requestId(): string {
  return crypto.randomUUID();
}

/** Auth endpoints never trigger a refresh-and-retry: a 401 there is the real answer. */
function skipsRefresh(url: string): boolean {
  return /^\/auth\/(refresh|login|register|logout)(\?|$)/.test(url);
}

export interface LockManagerLike {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
}

const REFRESH_LOCK = "auth-refresh";

/** The browser's Web Locks, or `undefined` where unsupported (the in-tab single-flight still applies). */
function browserLocks(): LockManagerLike | undefined {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return undefined;
  const { locks } = navigator;
  return { request: async (name, callback) => await locks.request(name, callback) };
}

interface RefreshAttempt {
  ok: boolean;
  /** The server said the refresh cookie is not valid (it may just have been rotated by another tab). */
  invalidToken: boolean;
}

/**
 * Session refresh, serialized twice over:
 * - in this tab, concurrent callers share one in-flight refresh (single-flight);
 * - across tabs, a Web Lock (`auth-refresh`) makes refreshes run one at a time. The refresh cookie is
 *   shared by all tabs and rotates on every use, so the tab that waited sends the *new* cookie.
 * If the server answers REFRESH_TOKEN_INVALID, one more attempt is made (taking the lock again)
 * before the session is cleared.
 */
export function createSessionRefresher(getLocks: () => LockManagerLike | undefined = browserLocks) {
  let inFlight: Promise<boolean> | null = null;

  async function attempt(): Promise<RefreshAttempt> {
    try {
      const id = requestId();
      const sentAt = Date.now();
      const response = await transportSend(`${baseUrl()}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Request-Id": id },
      });
      observeServerDate(response.headers.get("Date"), sentAt, Date.now());
      const body = await readBody(response);
      if (response.ok && isRecord(body) && typeof body.accessToken === "string") {
        const session = body as unknown as AuthResponse;
        useAuthStore
          .getState()
          .setSession({ accessToken: session.accessToken, user: session.user });
        return { ok: true, invalidToken: false };
      }
      const invalidToken = isRecord(body) && body.code === ErrorCode.REFRESH_TOKEN_INVALID;
      return { ok: false, invalidToken };
    } catch {
      return { ok: false, invalidToken: false };
    }
  }

  function serialized(): Promise<RefreshAttempt> {
    const locks = getLocks();
    return locks ? locks.request(REFRESH_LOCK, attempt) : attempt();
  }

  /** Resolves false (and clears the session) when the refresh fails. */
  return function refresh(): Promise<boolean> {
    inFlight ??= (async () => {
      try {
        let result = await serialized();
        if (!result.ok && result.invalidToken) result = await serialized();
        if (!result.ok) useAuthStore.getState().clear();
        return result.ok;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

export const refreshSession = createSessionRefresher();

async function request(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; id: string }> {
  const headers = new Headers(init.headers);
  const id = requestId();
  headers.set("X-Request-Id", id);
  const token = useAuthStore.getState().accessToken;
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  const sentAt = Date.now();
  const response = await transportSend(`${baseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  observeServerDate(response.headers.get("Date"), sentAt, Date.now());
  return { response, id };
}

/**
 * orval mutator. Resolves to `{ data, status, headers }` for 2xx and throws `ApiError` otherwise
 * (so React Query sees failures as errors). A 401 triggers one single-flight refresh and one retry.
 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  let { response, id } = await request(path, init);

  if (response.status === 401 && !skipsRefresh(path) && (await refreshSession())) {
    ({ response, id } = await request(path, init));
  }

  const data = await readBody(response);
  if (!response.ok) throw toApiError(response, data, id);
  return { data, status: response.status, headers: response.headers } as T;
}
