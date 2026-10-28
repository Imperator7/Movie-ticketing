import Link from "next/link";
import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";

const DEV_PAGES = [
  { href: "/design-system", label: "Design system" },
  { href: "/openapi", label: "API contract" },
  { href: "/er-diagram", label: "ER diagram" },
  { href: "/test-report", label: "Test report" },
] as const;

/** Document shell for the dev-only pages (/design-system, /openapi, /er-diagram, /test-report). Not part of production builds. */
export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <RootDocument lang="th">
      <nav
        aria-label="Dev pages"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/50 px-4 py-2 text-sm sm:px-6"
      >
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">dev</span>
        {DEV_PAGES.map((page) => (
          <Link key={page.href} href={page.href} className="text-foreground hover:underline">
            {page.label}
          </Link>
        ))}
        <Link href="/th" className="ml-auto text-muted-foreground hover:underline">
          ← App
        </Link>
      </nav>
      {children}
    </RootDocument>
  );
}
