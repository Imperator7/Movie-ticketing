import { routing } from "@/i18n/routing";

/**
 * Swaps only the locale segment of the current URL, keeping the rest of the path, the query and the hash.
 * `pathname` is the full pathname including the locale (e.g. `/th/movies/dune`).
 */
export function switchLocalePath(pathname: string, search: string, target: string): string {
  const segments = pathname.split("/");
  const first = segments[1];
  const hasLocale = routing.locales.some((locale) => locale === first);
  const rest = hasLocale ? segments.slice(2) : segments.slice(1);
  const path = `/${[target, ...rest].filter((s, i) => i === 0 || s !== "").join("/")}`;
  const query =
    search === "" || search === "?" ? "" : search.startsWith("?") ? search : `?${search}`;
  return `${path}${query}`;
}
