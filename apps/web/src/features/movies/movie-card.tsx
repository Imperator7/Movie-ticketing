"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MovieSummary } from "@/api/generated/model";
import { MoviePosterCard } from "@/components/cinema/movie-poster-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatReleaseDate } from "@/lib/format";
import { otherText, pickText, toLocale } from "@/lib/localized";

export function MovieCard({
  movie,
  priority = false,
}: {
  movie: MovieSummary;
  priority?: boolean;
}) {
  const t = useTranslations("movies");
  const locale = toLocale(useLocale());
  const title = pickText(movie.title, locale);
  const comingSoon = movie.status === "COMING_SOON";
  return (
    // One link, one tab stop; its accessible name is the title (the card text is decorative detail).
    <Link
      href={`/movie?slug=${encodeURIComponent(movie.slug)}`}
      aria-label={title}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <MoviePosterCard
        title={title}
        subtitle={otherText(movie.title, locale)}
        posterUrl={movie.posterUrl}
        rating={movie.rating}
        durationMinutes={movie.durationMin}
        genres={movie.genres.map((g) => pickText(g.name, locale))}
        locale={locale}
        synopsis={pickText(movie.synopsis, locale) || undefined}
        ctaLabel={comingSoon ? t("cardViewDetails") : t("cardSeeShowtimes")}
        releaseLabel={
          comingSoon
            ? t("cardReleasesOn", { date: formatReleaseDate(movie.releaseDate, locale) })
            : undefined
        }
        priority={priority}
      />
    </Link>
  );
}

export function MovieGrid({ movies }: { movies: readonly MovieSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {movies.map((movie, index) => (
        <li key={movie.id}>
          {/* The first row is above the fold: load it eagerly. */}
          <MovieCard movie={movie} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}

export function MovieGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
      ))}
    </div>
  );
}
