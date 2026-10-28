import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { THEME_INIT_HTML } from "@/lib/theme";
import { fontVariables } from "@/lib/fonts";
import "@/app/globals.css";

/** The `<html>`/`<body>` shell used by every root layout (there is no shared app/layout.tsx). */
export function RootDocument({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    // The theme init script sets the `dark` class before hydration, so the html attributes legitimately differ.
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${fontVariables} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          No-flash theme init, as real inline <script> markup in the server HTML, run by the parser
          before anything paints. It goes in through innerHTML on purpose: React never creates a
          <script> element on the client, so there is no "script tag while rendering" error when
          this layout re-renders (e.g. switching language). A CSP must allow it by hash.
        */}
        <div
          hidden
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_HTML }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
