import { ErrorCode, type AuthResponse } from "@/api/generated/model";
import { useAuthStore } from "@/features/auth/store";

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

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request
 * (the API rotates the cookie, so two parallel refreshes would revoke the session family).
 * Resolves false (and clears the session) when the refresh fails.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const id = requestId();
      const response = await fetch(`${baseUrl()}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Request-Id": id },
      });
      const body = await readBody(response);
      if (!response.ok || !isRecord(body) || typeof body.accessToken !== "string") {
        useAuthStore.getState().clear();
        return false;
      }
      const session = body as unknown as AuthResponse;
      useAuthStore.getState().setSession({ accessToken: session.accessToken, user: session.user });
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function send(path: string, init: RequestInit): Promise<{ response: Response; id: string }> {
  const headers = new Headers(init.headers);
  const id = requestId();
  headers.set("X-Request-Id", id);
  const token = useAuthStore.getState().accessToken;
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  return { response, id };
}

/**
 * orval mutator. Resolves to `{ data, status, headers }` for 2xx and throws `ApiError` otherwise
 * (so React Query sees failures as errors). A 401 triggers one single-flight refresh and one retry.
 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  let { response, id } = await send(path, init);

  if (response.status === 401 && !skipsRefresh(path) && (await refreshSession())) {
    ({ response, id } = await send(path, init));
  }

  const data = await readBody(response);
  if (!response.ok) throw toApiError(response, data, id);
  return { data, status: response.status, headers: response.headers } as T;
}
