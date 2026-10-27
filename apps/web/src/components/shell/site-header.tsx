import { Film } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { ThemeMenu } from "@/components/shell/theme-menu";
import { UserMenu } from "@/features/auth/user-menu";
import { Button } from "@/components/ui/button";

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  const common = await getTranslations("common");

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight"
        >
          <Film aria-hidden className="size-5 text-primary" />
          {common("appName")}
        </Link>

        <nav
          aria-label={t("mainNavigation")}
          className="order-last flex w-full gap-1 text-sm sm:order-none sm:w-auto sm:flex-1"
        >
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${locale}/movies`}>{t("movies")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${locale}/bookings`}>{t("myBookings")}</Link>
          </Button>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
