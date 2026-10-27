"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("states");
  const common = useTranslations("common");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("errorDescription")}</p>
      <Button onClick={reset}>{common("retry")}</Button>
    </main>
  );
}
