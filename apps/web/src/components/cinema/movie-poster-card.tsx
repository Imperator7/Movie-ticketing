"use client";

import { ArrowRight, Film } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { formatDuration, type Locale } from "@/lib/format";
import { POSTER_GRID_SIZES, tmdbImage, tmdbSrcSet } from "@/lib/tmdb-image";
import { RatingBadge, type ThaiRating } from "./rating-badge";

const MAX_GENRES = 2;

export interface MoviePosterCardProps {
  /** Primary title (Thai by default). */
  title: string;
  /** Secondary title, usually the other language. Hidden when it equals the title. */
  subtitle?: string;
  posterUrl?: string | null;
  rating: ThaiRating;
  durationMinutes: number;
  genres: readonly string[];
  locale?: Locale;
  /** Shown for hover/focus (3 lines). Touch devices never need it: the card links to the movie page. */
  synopsis?: string;
  /** "See showtimes" affordance next to the synopsis. */
  ctaLabel?: string;
  /** Chip for movies that are not out yet, already formatted ("In cinemas 12 Nov"). */
  releaseLabel?: string;
  /** Poster + rating only (e.g. the hero on the movie page, where the details are next to it). */
  showDetails?: boolean;
  /** Above-the-fold posters load eagerly; the rest are lazy. */
  priority?: boolean;
  /** `sizes` attribute for the responsive poster. */
  sizes?: string;
  className?: string;
}

/** Token-based placeholder, also the fallback when the image fails to load. Same box, so nothing shifts. */
function PosterPlaceholder({ title, showTitle }: { title: string; showTitle: boolean }) {
  return (
    <div
      role="img"
      aria-label={title}
      className="flex size-full items-center justify-center bg-linear-to-br from-primary/40 via-card to-gold/30 p-4"
    >
      {showTitle ? (
        <span className="text-center font-heading text-lg leading-snug font-semibold text-balance">
          {title}
        </span>
      ) : (
        <Film aria-hidden className="size-10 text-foreground/25" />
      )}
    </div>
  );
}

/**
 * The 2:3 poster. A plain `<img>` (static export: no image optimizer) with a TMDB `srcset`, explicit
 * dimensions and lazy loading; no poster or a failed load shows the placeholder in the same box.
 */
export function PosterImage({
  url,
  title,
  priority = false,
  sizes = POSTER_GRID_SIZES,
  placeholderShowsTitle = true,
}: {
  url: string | null | undefined;
  title: string;
  priority?: boolean;
  sizes?: string;
  /** False when the title is already written on the card. */
  placeholderShowsTitle?: boolean;
}) {
  // Remember *which* URL failed, so a new URL gets a fresh try without an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = tmdbImage(url, "w342");
  if (!src || failedUrl === url) {
    return <PosterPlaceholder title={title} showTitle={placeholderShowsTitle} />;
  }

  return (
    // Static export: next/image's optimizer is unavailable, so a plain img is intended here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={tmdbSrcSet(url)}
      sizes={sizes}
      alt={title}
      width={342}
      height={513}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => {
        setFailedUrl(url ?? null);
      }}
      className="size-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
    />
  );
}

/**
 * A full-bleed poster card: the poster fills the card and the details are written on it over a
 * dark scrim (always dark, so the light text keeps AA contrast in both themes). On hover-capable
 * devices the scrim grows to show the synopsis and a call to action; touch devices just see the
 * card, which links to the movie page.
 */
export function MoviePosterCard({
  title,
  subtitle,
  posterUrl,
  rating,
  durationMinutes,
  genres,
  locale = "th",
  synopsis,
  ctaLabel,
  releaseLabel,
  showDetails = true,
  priority = false,
  sizes,
  className,
}: MoviePosterCardProps) {
  const showSubtitle =
    subtitle !== undefined && subtitle.trim().toLowerCase() !== title.trim().toLowerCase();
  const meta = [formatDuration(durationMinutes, locale), ...genres.slice(0, MAX_GENRES)].filter(
    Boolean,
  );
  const hasMore = Boolean(synopsis ?? ctaLabel);

  return (
    <article
      className={cn(
        "group relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-muted",
        className,
      )}
    >
      <div className="absolute inset-0">
        <PosterImage
          url={posterUrl}
          title={title}
          priority={priority}
          sizes={sizes}
          placeholderShowsTitle={!showDetails}
        />
      </div>

      <RatingBadge rating={rating} className="absolute top-2 left-2 bg-card" />
      {showDetails && releaseLabel ? (
        <span className="absolute top-2 right-2 rounded-full bg-scrim/85 px-2 py-0.5 text-xs font-medium text-scrim-foreground">
          {releaseLabel}
        </span>
      ) : null}

      {showDetails ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-scrim from-30% via-scrim/90 to-transparent px-3 pt-14 pb-3 text-scrim-foreground">
          <h3 className="line-clamp-2 font-heading text-base leading-snug font-semibold">
            {title}
          </h3>
          {showSubtitle ? (
            <p className="line-clamp-1 text-sm text-scrim-foreground/80">{subtitle}</p>
          ) : null}
          <p className="pt-1 text-xs text-scrim-foreground/80">{meta.join(" · ")}</p>

          {hasMore ? (
            // Revealed by hover (hover-capable devices only) or keyboard focus. Collapsed otherwise.
            <div className="grid grid-rows-[0fr] motion-safe:transition-[grid-template-rows] motion-safe:duration-200 group-hover:grid-rows-[1fr] in-focus-visible:grid-rows-[1fr]">
              <div className="overflow-hidden">
                {synopsis ? (
                  <p className="line-clamp-3 pt-2 text-xs leading-relaxed text-scrim-foreground/90">
                    {synopsis}
                  </p>
                ) : null}
                {ctaLabel ? (
                  <p className="flex items-center gap-1 pt-2 text-sm font-medium text-scrim-foreground">
                    {ctaLabel}
                    <ArrowRight aria-hidden className="size-4" />
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
