import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        {/* Required attribution text from TMDB's terms; kept in English in every locale. */}
        <p lang="en">{t("tmdb")}</p>
        <p>{t("copyright")}</p>
      </div>
    </footer>
  );
}
