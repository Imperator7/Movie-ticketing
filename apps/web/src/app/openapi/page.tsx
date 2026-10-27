import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { parse } from "yaml";
import { OpenApiViewer } from "@/components/openapi-viewer";

export const metadata: Metadata = {
  title: "API Contract · Movie Ticketing",
  description: "OpenAPI design contract for the Movie Ticketing MVP",
};

const specPath = path.join(process.cwd(), "..", "..", "docs", "openapi.yaml");

export default function OpenApiPage() {
  // Read inside the component: once at `next build` for the static export, on every request in `next dev`.
  const spec = parse(readFileSync(specPath, "utf-8")) as Record<string, unknown>;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          API design · MVP
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">OpenAPI Contract</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Source: <code>docs/openapi.yaml</code>. Lint with <code>npm run lint:openapi</code>.
        </p>
      </header>

      <OpenApiViewer spec={spec} />
    </main>
  );
}
