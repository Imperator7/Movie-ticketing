import type { LocalizedText } from "@/api/generated/model";
import type { Locale } from "./format";

export function toLocale(value: string): Locale {
  return value === "en" ? "en" : "th";
}

/** The text in the current locale. */
export function pickText(text: LocalizedText, locale: Locale): string {
  return text[locale];
}

/** The text in the other language (used as the poster card's subtitle). */
export function otherText(text: LocalizedText, locale: Locale): string {
  return text[locale === "th" ? "en" : "th"];
}
