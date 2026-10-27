"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useGetMovie, useListMovieShowtimes } from "@/api/generated/endpoints/catalog/catalog";
import type { ShowtimeFormat } from "@/api/generated/model";
import { dataOf } from "@/api/unwrap";
import { MoviePosterCard } from "@/components/cinema/movie-poster-card";
import { ShowtimeChip, type ShowtimeFormat as ChipFormat } from "@/components/cinema/showtime-chip";
import { PageContainer, QueryError } from "@/components/page-states";
import { Skeleton } from "@/components/ui/skeleton";
import { showtimePath } from "@/features/showtimes/seat-params";
import { useRouter, Link } from "@/i18n/navigation";
import { bangkokDate, formatDuration, formatShowDate } from "@/lib/format";
import { otherText, pickText, toLocale } from "@/lib/localized";
import { ApiError } from "@/lib/api-client";
import { cn } from "cn";

const CHIP_FORMAT: Record<ShowtimeFormat, ChipFormat> = {
  TWO_D: "2D",
  THREE_D: "3D",
  IMAX: "IMAX",
};

/** `/movie?slug=&date=`: hero, date strip and showtimes grouped by cinema. */
export function MovieView() {
  const t = useTranslations("movie");
  const locale = toLocale(useLocale());
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("slug") ?? "";
  const dateParam = params.get("date");
  const [today] = useState(() => bangkokDate(Date.now()));
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const movieQuery = useGetMovie(slug, { query: { enabled: slug !== "" } });
  const movie = dataOf(movieQuery.data);
  const showtimesQuery = useListMovieShowtimes(
    slug,
    { date },
    { query: { enabled: slug !== "" && movie?.status === "NOW_SHOWING" } },
  );
  const showtimes = dataOf(showtimesQuery.data);

  if (movieQuery.isError) {
    const missing = movieQuery.error instanceof ApiError && movieQuery.error.status === 404;
    return (
      <PageContainer>
        <QueryError
          title={missing ? t("notFound") : t("loadError")}
          error={movieQuery.error}
          onRetry={() => void movieQuery.refetch()}
        />
      </PageContainer>
    );
  }

  if (!movie) {
    return (
      <PageContainer>
        <div aria-busy="true" className="flex flex-col gap-4 sm:flex-row">
          <Skeleton className="aspect-[2/3] w-40 sm:w-56" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  const title = pickText(movie.title, locale);
  const dates = showtimes?.availableDates ?? [];

  return (
    <PageContainer>
      <div className="flex flex-col gap-10">
        <Link href="/movies" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t("back")}
        </Link>

        <section className="flex flex-col gap-6 sm:flex-row">
          <div className="w-40 shrink-0 sm:w-56">
            <MoviePosterCard
              title={title}
              posterUrl={movie.posterUrl}
              rating={movie.rating}
              durationMinutes={movie.durationMin}
              genres={[]}
              locale={locale}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
            <p className="text-lg text-muted-foreground">{otherText(movie.title, locale)}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-4" />
                {formatDuration(movie.durationMin, locale)}
              </span>
              <span>{movie.genres.map((g) => pickText(g.name, locale)).join(" / ")}</span>
              <span>{t("releaseDate", { date: formatShowDate(movie.releaseDate, locale) })}</span>
            </p>
            <h2 className="mt-2 text-lg font-semibold">{t("synopsis")}</h2>
            <p className="max-w-prose text-muted-foreground">{pickText(movie.synopsis, locale)}</p>
          </div>
        </section>

        <section aria-labelledby="showtimes" className="flex flex-col gap-5">
          <h2 id="showtimes" className="text-2xl font-semibold">
            {t("showtimes")}
          </h2>

          {movie.status === "COMING_SOON" ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">
              {t("comingSoonNote")}
            </p>
          ) : (
            <>
              <div
                role="group"
                aria-label={t("dateStrip")}
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
              >
                {(dates.length > 0 ? dates : [date]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={d === date}
                    onClick={() => {
                      router.replace(`/movie?slug=${encodeURIComponent(slug)}&date=${d}`, {
                        scroll: false,
                      });
                    }}
                    className={cn(
                      "shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      d === date
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {formatShowDate(d, locale)}
                  </button>
                ))}
              </div>

              {showtimesQuery.isPending ? (
                <div aria-busy="true" className="flex gap-3">
                  <Skeleton className="h-20 w-24" />
                  <Skeleton className="h-20 w-24" />
                  <Skeleton className="h-20 w-24" />
                </div>
              ) : null}
              {showtimesQuery.isError ? (
                <QueryError
                  title={t("loadError")}
                  error={showtimesQuery.error}
                  onRetry={() => void showtimesQuery.refetch()}
                />
              ) : null}
              {showtimes?.cinemas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6">
                  <p className="font-medium">{t("noShowtimes")}</p>
                  <p className="text-sm text-muted-foreground">{t("noShowtimesHint")}</p>
                </div>
              ) : null}
              {showtimes?.cinemas.map(({ cinema, showtimes: slots }) => (
                <div key={cinema.id} className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{pickText(cinema.name, locale)}</h3>
                    <p className="text-sm text-muted-foreground">
                      {pickText(cinema.address, locale)}
                    </p>
                  </div>
                  <ul className="flex flex-wrap gap-3">
                    {slots.map((slot) => (
                      <li key={slot.id} className="flex flex-col items-center gap-1">
                        <ShowtimeChip
                          startsAt={slot.startsAt}
                          format={CHIP_FORMAT[slot.format]}
                          seatsLeft={slot.seatsLeft}
                          closed={slot.seatsLeft === 0}
                          labels={{
                            fewSeatsLeft: (count) => t("fewLeft", { count }),
                            closed: t("closed"),
                          }}
                          onSelect={() => {
                            router.push(showtimePath(slot.id, []));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {t("hall", { number: slot.hallNumber })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
