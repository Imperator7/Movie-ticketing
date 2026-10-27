import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { MoviesView } from "@/features/movies/movies-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MoviesView />
    </Suspense>
  );
}
