import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { LoginView } from "@/features/auth/auth-views";

// Query-string routes (static export): `useSearchParams` needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LoginView />
    </Suspense>
  );
}
