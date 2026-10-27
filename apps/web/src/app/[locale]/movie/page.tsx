import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { MovieView } from "@/features/movies/movie-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MovieView />
    </Suspense>
  );
}
