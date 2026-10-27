"use client";

import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useListGenres, useListMovies } from "@/api/generated/endpoints/catalog/catalog";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { pickText, toLocale } from "@/lib/localized";
import { cn } from "cn";
import { MovieGrid, MovieGridSkeleton } from "./movie-card";
import { useDebouncedValue } from "./use-debounced-value";

const SEARCH_DEBOUNCE_MS = 300;

/** `/movies?genre=&q=`: both filters live in the URL (the search box is debounced). */
export function MoviesView() {
  const t = useTranslations("movies");
  const locale = toLocale(useLocale());
  const router = useRouter();
  const params = useSearchParams();
  const genre = params.get("genre") ?? "";
  const q = params.get("q") ?? "";

  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);

  const setFilters = (next: { genre?: string; q?: string }) => {
    const query = new URLSearchParams();
    const nextGenre = next.genre ?? genre;
    const nextQ = next.q ?? q;
    if (nextGenre) query.set("genre", nextGenre);
    if (nextQ) query.set("q", nextQ);
    const qs = query.toString();
    router.replace(qs ? `/movies?${qs}` : "/movies", { scroll: false });
  };

  // Debounced search text -> URL.
  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed === q) return;
    const query = new URLSearchParams();
    if (genre) query.set("genre", genre);
    if (trimmed) query.set("q", trimmed);
    const qs = query.toString();
    router.replace(qs ? `/movies?${qs}` : "/movies", { scroll: false });
    // `q` and `genre` come from the URL this effect writes to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Back/forward or a link changed ?q= from outside: show it in the box.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== text.trim()) setText(q);
  }

  const genres = dataOf(useListGenres().data) ?? [];
  const query = useListMovies({ genre: genre || undefined, q: q || undefined, pageSize: 50 });
  const movies = dataOf(query.data)?.items;
  const filtered = genre !== "" || q !== "";

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>

        <div className="relative max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>

        <div role="group" aria-label={t("genresLabel")} className="flex flex-wrap gap-2">
          <GenreChip
            active={genre === ""}
            onClick={() => {
              setFilters({ genre: "" });
            }}
          >
            {t("allGenres")}
          </GenreChip>
          {genres.map((g) => (
            <GenreChip
              key={g.id}
              active={genre === g.slug}
              onClick={() => {
                setFilters({ genre: g.slug });
              }}
            >
              {pickText(g.name, locale)}
            </GenreChip>
          ))}
        </div>

        {query.isPending ? <MovieGridSkeleton count={8} /> : null}
        {query.isError ? (
          <QueryError
            title={t("loadError")}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {movies ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {t("resultCount", { count: movies.length })}
            </p>
            {movies.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
                <p className="text-lg font-medium">{t("empty")}</p>
                <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
                {filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setText("");
                      router.replace("/movies", { scroll: false });
                    }}
                  >
                    <X aria-hidden data-icon="inline-start" />
                    {t("clearFilters")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <MovieGrid movies={movies} />
            )}
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}

function GenreChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
