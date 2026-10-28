import { bangkokDateOf } from "../common/time/bangkok.js";

/** Escapes `\`, `%` and `_` so user input is matched literally by LIKE/ILIKE. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

/** Trims and collapses whitespace. Returns undefined for an empty search, meaning "no filter". */
export function normalizeSearch(q: string | undefined): string | undefined {
  const trimmed = q?.trim().replace(/\s+/g, " ");
  if (trimmed === undefined || trimmed === "") return undefined;
  return trimmed;
}

export interface PageWindow {
  skip: number;
  take: number;
}

export function pageWindow(page: number, pageSize: number): PageWindow {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Distinct Bangkok calendar days of the given instants, ascending. */
export function distinctBangkokDates(instants: readonly Date[]): string[] {
  return [...new Set(instants.map(bangkokDateOf))].sort();
}
