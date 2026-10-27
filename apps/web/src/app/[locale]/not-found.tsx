import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { routing } from "@/i18n/routing";

export default function LocaleNotFound() {
  const t = useTranslations("states");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundDescription")}</p>
      <Button asChild>
        <Link href={`/${routing.defaultLocale}`}>{t("backHome")}</Link>
      </Button>
    </main>
  );
}
