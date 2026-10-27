import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { CheckoutView } from "@/features/payments/checkout-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckoutView />
    </Suspense>
  );
}
