/**
 * TMDB serves each image in several widths: `https://image.tmdb.org/t/p/<size>/<file>`.
 * These helpers pick a size for the layout and build `srcset`s. Anything that is not a TMDB URL
 * (other hosts, relative paths) passes through untouched.
 */

export type PosterSize = "w185" | "w342" | "w500" | "w780";
export type BackdropSize = "w780" | "w1280";
export type TmdbSize = PosterSize | BackdropSize;

const TMDB_IMAGE = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|h\d+|original)(\/[^?#]+)$/;

export const POSTER_SIZES: readonly PosterSize[] = ["w185", "w342", "w500", "w780"];
export const BACKDROP_SIZES: readonly BackdropSize[] = ["w780", "w1280"];

const widthOf = (size: TmdbSize) => Number(size.slice(1));

export function isTmdbImage(url: string | null | undefined): url is string {
  return typeof url === "string" && TMDB_IMAGE.test(url);
}

/** The URL at the given TMDB size. Non-TMDB URLs are returned as they are; null/undefined give null. */
export function tmdbImage(url: string | null | undefined, size: TmdbSize): string | null {
  if (!url) return null;
  const match = TMDB_IMAGE.exec(url);
  return match ? `${match[1] ?? ""}${size}${match[2] ?? ""}` : url;
}

/** A `srcset` over the given sizes, or undefined when the URL is not a TMDB image. */
export function tmdbSrcSet(
  url: string | null | undefined,
  sizes: readonly TmdbSize[] = POSTER_SIZES,
): string | undefined {
  if (!isTmdbImage(url)) return undefined;
  return sizes
    .map((size) => `${tmdbImage(url, size) ?? ""} ${widthOf(size).toString()}w`)
    .join(", ");
}

/** `sizes` attributes for the layouts that show posters (matches the grid columns in movie-card.tsx). */
export const POSTER_GRID_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";
export const POSTER_HERO_SIZES = "(min-width: 640px) 224px, 160px";
export const BACKDROP_SIZES_ATTR = "(min-width: 1280px) 1152px, 100vw";
