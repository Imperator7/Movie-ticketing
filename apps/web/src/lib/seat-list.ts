import type { Locale } from "./format";

const AND: Record<Locale, string> = { th: " และ ", en: " and " };

/** "A5", "A5 and A6", "A5, A6 and A7" (Thai: "A5 และ A6"): seat labels as a natural list. */
export function formatSeatList(labels: readonly string[], locale: Locale): string {
  if (labels.length <= 1) return labels.join("");
  const last = labels[labels.length - 1] ?? "";
  return `${labels.slice(0, -1).join(", ")}${AND[locale]}${last}`;
}
