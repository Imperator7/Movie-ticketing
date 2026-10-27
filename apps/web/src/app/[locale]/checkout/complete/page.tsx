import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { CheckoutCompleteView } from "@/features/payments/checkout-complete-view";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckoutCompleteView />
    </Suspense>
  );
}
