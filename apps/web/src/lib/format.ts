export type Locale = "th" | "en";

const INTL_LOCALE: Record<Locale, string> = { th: "th-TH", en: "en-GB" };

const bahtFormatters = new Map<Locale, Intl.NumberFormat>();

/** Whole-baht price, e.g. 1250 → "฿1,250" (both locales use the ฿ sign). */
export function formatBaht(amount: number, locale: Locale = "th"): string {
  let formatter = bahtFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: "currency",
      currency: "THB",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    });
    bahtFormatters.set(locale, formatter);
  }
  return formatter.format(amount);
}

/** Remaining time as "m:ss". Negative values show "0:00". */
export function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export type CountdownTone = "normal" | "warning" | "expired";

/** Countdown colour: warning in the last minute, expired at zero. */
export function countdownTone(msLeft: number): CountdownTone {
  if (msLeft <= 0) return "expired";
  if (msLeft <= 60_000) return "warning";
  return "normal";
}

/** Duration in minutes as "2h 46m" / "2 ชม. 46 นาที". */
export function formatDuration(minutes: number, locale: Locale = "th"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "th") return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

/** Showtime clock time in Bangkok, e.g. "19:30". */
export function formatShowtime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

const INTL_LOCALE_FULL: Record<Locale, string> = { th: "th-TH", en: "en-GB" };

/** Bangkok calendar day of a timestamp as "YYYY-MM-DD". */
export function bangkokDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(ms));
}

/** Short weekday + day + month in Bangkok. Takes "YYYY-MM-DD" or an ISO instant. */
export function formatShowDate(value: string, locale: Locale = "th"): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+07:00` : value;
  return new Intl.DateTimeFormat(INTL_LOCALE_FULL[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

/** Full date and time in Bangkok for tickets, e.g. "28 Oct 2026, 19:30". */
export function formatShowDateTime(iso: string, locale: Locale = "th"): string {
  return new Intl.DateTimeFormat(INTL_LOCALE_FULL[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}
