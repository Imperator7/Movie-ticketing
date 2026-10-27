import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { fontVariables } from "@/lib/fonts";
import "@/app/globals.css";

/** The `<html>`/`<body>` shell used by every root layout (there is no shared app/layout.tsx). */
export function RootDocument({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    // next-themes sets the theme class before hydration, so the html attributes legitimately differ.
    <html lang={lang} suppressHydrationWarning className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
