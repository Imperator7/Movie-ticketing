/** `?page=` as a positive integer (anything else is page 1). */
export function parsePage(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Locale-less `/movies` URL for the given filters. Empty filters and page 1 are left out. */
export function moviesPath(state: { genre?: string; q?: string; page?: number }): string {
  const query = new URLSearchParams();
  if (state.genre) query.set("genre", state.genre);
  if (state.q) query.set("q", state.q);
  if (state.page && state.page > 1) query.set("page", String(state.page));
  const qs = query.toString();
  return qs ? `/movies?${qs}` : "/movies";
}
