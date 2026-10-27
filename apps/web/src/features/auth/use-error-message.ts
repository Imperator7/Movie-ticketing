import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiError } from "@/lib/api-client";

/** `t("errors.<CODE>")` for an API error. The API's English `message` is never shown (plan §5). */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown) => (error instanceof ApiError ? t(error.code) : t("INTERNAL_ERROR")),
    [t],
  );
}
