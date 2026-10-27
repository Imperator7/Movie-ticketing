import { routing } from "@/i18n/routing";

function isSupportedLocale(value: string | undefined): boolean {
  return routing.locales.some((locale) => locale === value);
}

function isUnsafeChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code <= 0x20 || code === 0x7f || char === "\\";
}

/**
 * Post-login redirect target (WEB-5). Only same-site relative paths under /th or /en are accepted;
 * everything else (absolute or protocol-relative URLs, backslashes, dot segments, other locales
 * that do not exist) falls back to `/<locale>`.
 */
export function safeNextPath(next: string | null | undefined, locale: string): string {
  const fallback = `/${locale}`;
  if (!next) return fallback;
  // Control characters, whitespace and backslashes are treated as hostile by some browsers.
  if (Array.from(next).some(isUnsafeChar)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  const path = next.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/").slice(1);
  if (!isSupportedLocale(segments[0])) return fallback;

  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return fallback;
    }
    if (decoded === ".." || decoded === "." || /[/\\]/.test(decoded)) return fallback;
  }
  return next;
}
