"use client";

import { useState } from "react";
import { cn } from "cn";
import { formatDuration, type Locale } from "@/lib/format";
import { POSTER_GRID_SIZES, tmdbImage, tmdbSrcSet } from "@/lib/tmdb-image";
import { RatingBadge, type ThaiRating } from "./rating-badge";

export interface MoviePosterCardProps {
  /** Primary title (Thai by default). */
  title: string;
  /** Secondary title, usually English. */
  subtitle?: string;
  posterUrl?: string | null;
  rating: ThaiRating;
  durationMinutes: number;
  genres: readonly string[];
  locale?: Locale;
  /** Above-the-fold posters load eagerly; the rest are lazy. */
  priority?: boolean;
  /** `sizes` attribute for the responsive poster. */
  sizes?: string;
  className?: string;
}

/** Token-based placeholder, also the fallback when the image fails to load. Same box, so nothing shifts. */
function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div
      role="img"
      aria-label={title}
      className="flex size-full items-center justify-center bg-linear-to-br from-primary/40 via-card to-gold/30 p-4"
    >
      <span className="text-center font-heading text-lg leading-snug font-semibold text-balance">
        {title}
      </span>
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
}: {
  url: string | null | undefined;
  title: string;
  priority?: boolean;
  sizes?: string;
}) {
  // Remember *which* URL failed, so a new URL gets a fresh try without an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = tmdbImage(url, "w342");
  if (!src || failedUrl === url) return <PosterPlaceholder title={title} />;

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
      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

export function MoviePosterCard({
  title,
  subtitle,
  posterUrl,
  rating,
  durationMinutes,
  genres,
  locale = "th",
  priority = false,
  sizes,
  className,
}: MoviePosterCardProps) {
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        <PosterImage url={posterUrl} title={title} priority={priority} sizes={sizes} />
        <RatingBadge rating={rating} className="absolute top-2 left-2 bg-card" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-heading text-base leading-snug font-semibold">{title}</h3>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          {formatDuration(durationMinutes, locale)}
          {genres.length > 0 ? ` · ${genres.join(" / ")}` : ""}
        </p>
      </div>
    </article>
  );
}
