import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";
import { routing } from "@/i18n/routing";

// Root layout for `/` (no app/layout.tsx exists: each route group owns its <html>, so `lang` can follow the locale).
export default function RedirectLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang={routing.defaultLocale}>{children}</RootDocument>;
}
