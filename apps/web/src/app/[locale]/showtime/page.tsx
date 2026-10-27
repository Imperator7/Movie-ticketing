import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ShowtimeView } from "@/features/showtimes/showtime-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ShowtimeView />
    </Suspense>
  );
}
