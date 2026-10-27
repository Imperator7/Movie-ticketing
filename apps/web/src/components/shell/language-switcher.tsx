"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/i18n/routing";
import { switchLocalePath } from "@/lib/locale-path";
import { cn } from "cn";

/** Swaps only the locale segment of the current URL; the rest of the path and the query stay. */
export function LanguageSwitcher() {
  const t = useTranslations("language");
  const current = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex rounded-lg border border-border p-0.5"
    >
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={switchLocalePath(pathname, search, locale)}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? "true" : undefined}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            locale === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(locale)}
        </Link>
      ))}
    </div>
  );
}
