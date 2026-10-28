import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  UseInterceptors,
  mixin,
} from "@nestjs/common";
import type { Response } from "express";
import { tap } from "rxjs";

/** Every response is `no-store` unless a route opts in below: auth, errors and anything personal stay uncached. */
export const NO_STORE = "no-store";

/**
 * Public, rarely changing catalog data (genres, cinemas, movies): browsers and the CDN may reuse it for a minute
 * and serve it stale for up to five more while they revalidate in the background.
 */
export const CATALOG_CACHE = "public, max-age=60, stale-while-revalidate=300";

/**
 * Showtime lists embed `seatsLeft` and the "still bookable" cut-off, which move with every booking, so they get a
 * much shorter window. The seat map and booking calls stay `no-store` and are the source of truth.
 */
export const SHOWTIMES_CACHE = "public, max-age=15, stale-while-revalidate=60";

/** Express middleware: the default for every response. */
export function noStoreByDefault(
  _req: unknown,
  res: Pick<Response, "setHeader">,
  next: () => void,
): void {
  res.setHeader("Cache-Control", NO_STORE);
  next();
}

/**
 * Sets `Cache-Control` only when the handler succeeded. Errors keep the default `no-store` (the exception filter
 * also forces it), so a 404 or 422 can never be cached as if it were catalog data.
 */
export function CacheControl(value: string): MethodDecorator & ClassDecorator {
  class CacheControlInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler["handle"]> {
      const response = context.switchToHttp().getResponse<Response>();
      return next.handle().pipe(
        tap(() => {
          response.setHeader("Cache-Control", value);
        }),
      );
    }
  }
  return UseInterceptors(mixin(CacheControlInterceptor));
}
