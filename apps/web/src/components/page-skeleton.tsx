import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for pages that read `?query` params (required by the static export). */
export function PageSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-1/2 max-w-md" />
        <Skeleton className="h-5 w-1/3 max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  );
}
