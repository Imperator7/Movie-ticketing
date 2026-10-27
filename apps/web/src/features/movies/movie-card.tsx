"use client";

import { useLocale } from "next-intl";
import type { MovieSummary } from "@/api/generated/model";
import { MoviePosterCard } from "@/components/cinema/movie-poster-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { otherText, pickText, toLocale } from "@/lib/localized";

export function MovieCard({
  movie,
  priority = false,
}: {
  movie: MovieSummary;
  priority?: boolean;
}) {
  const locale = toLocale(useLocale());
  return (
    <Link
      href={`/movie?slug=${encodeURIComponent(movie.slug)}`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      <MoviePosterCard
        title={pickText(movie.title, locale)}
        subtitle={otherText(movie.title, locale)}
        posterUrl={movie.posterUrl}
        rating={movie.rating}
        durationMinutes={movie.durationMin}
        genres={movie.genres.map((g) => pickText(g.name, locale))}
        locale={locale}
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
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
