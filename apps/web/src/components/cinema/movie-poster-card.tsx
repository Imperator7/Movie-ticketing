import { cn } from "cn";
import { formatDuration, type Locale } from "@/lib/format";
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
  className?: string;
}

export function MoviePosterCard({
  title,
  subtitle,
  posterUrl,
  rating,
  durationMinutes,
  genres,
  locale = "th",
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
        {posterUrl ? (
          // Static export: next/image's optimizer is unavailable, so a plain img is intended here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            role="img"
            aria-label={title}
            className="flex size-full items-center justify-center bg-linear-to-br from-primary/40 via-card to-gold/30 p-4"
          >
            <span className="font-heading text-center text-lg leading-snug font-semibold text-balance">
              {title}
            </span>
          </div>
        )}
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
