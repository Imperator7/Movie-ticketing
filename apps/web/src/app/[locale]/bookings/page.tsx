import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BookingsView } from "@/features/bookings/bookings-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingsView />
    </Suspense>
  );
}
