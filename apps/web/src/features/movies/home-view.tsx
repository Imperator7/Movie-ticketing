"use client";

import { useTranslations } from "next-intl";
import { useListMovies } from "@/api/generated/endpoints/catalog/catalog";
import { dataOf } from "@/api/unwrap";
import { PageContainer, QueryError } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { MovieGrid, MovieGridSkeleton } from "./movie-card";

function Section({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status: "NOW_SHOWING" | "COMING_SOON";
}) {
  const t = useTranslations("home");
  const query = useListMovies({ status, pageSize: 12 });
  const movies = dataOf(query.data)?.items;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id={id} className="text-2xl font-semibold">
          {title}
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/movies">{t("seeAll")}</Link>
        </Button>
      </div>
      {query.isPending ? <MovieGridSkeleton /> : null}
      {query.isError ? (
        <QueryError
          title={t("loadError")}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {movies?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}
      {movies && movies.length > 0 ? <MovieGrid movies={movies} /> : null}
    </section>
  );
}

export function HomeView() {
  const t = useTranslations("home");
  return (
    <PageContainer>
      <div className="flex flex-col gap-12">
        <header className="flex flex-col gap-3 py-4">
          <h1 className="text-4xl font-bold sm:text-5xl">{t("title")}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">{t("subtitle")}</p>
        </header>
        <Section id="now-showing" title={t("nowShowing")} status="NOW_SHOWING" />
        <Section id="coming-soon" title={t("comingSoon")} status="COMING_SOON" />
      </div>
    </PageContainer>
  );
}
