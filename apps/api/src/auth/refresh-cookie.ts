import type { CookieOptions } from "express";
import { REFRESH_TOKEN_TTL_MS } from "./refresh-rotation.js";

export const REFRESH_COOKIE_NAME = "rt";
/** Only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/** `rt=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800` */
export function refreshCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS, // Express takes milliseconds and writes Max-Age in seconds
  };
}

/** Options for clearing: must match name, path, secure and sameSite (maxAge is ignored by clearCookie). */
export function clearCookieOptions(secure: boolean): CookieOptions {
  const { maxAge: _maxAge, ...rest } = refreshCookieOptions(secure);
  return rest;
}
