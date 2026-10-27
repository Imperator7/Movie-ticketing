import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BookingView } from "@/features/bookings/booking-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingView />
    </Suspense>
  );
}
