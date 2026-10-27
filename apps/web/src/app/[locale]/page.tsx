import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export { generateStaticParams } from "./layout";

/** Placeholder home: hero + an empty "now showing" section. Real screens come after design approval. */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see src/i18n/request.ts
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <section className="flex flex-col gap-3 py-6">
        <h1 className="text-4xl font-bold sm:text-5xl">{t("title")}</h1>
        <p className="max-w-prose text-lg text-muted-foreground">{t("subtitle")}</p>
      </section>
      <section aria-labelledby="now-showing" className="flex flex-col gap-4">
        <h2 id="now-showing" className="text-2xl font-semibold">
          {t("nowShowing")}
        </h2>
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      </section>
    </main>
  );
}
