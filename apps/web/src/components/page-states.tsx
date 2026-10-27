"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/features/auth/use-error-message";

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>;
}

/** A failed query: the translated reason (from the API error code) and a retry button. */
export function QueryError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const common = useTranslations("common");
  const message = useErrorMessage();
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message(error)}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            {common("retry")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
