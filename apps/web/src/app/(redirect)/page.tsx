import { RedirectToDefaultLocale } from "@/components/redirect-to-default-locale";

/** `/` has no content: a tiny client redirect to the default locale (a static export has no middleware). */
export default function RootPage() {
  return <RedirectToDefaultLocale />;
}
