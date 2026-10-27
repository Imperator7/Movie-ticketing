import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { RegisterView } from "@/features/auth/auth-views";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RegisterView />
    </Suspense>
  );
}
