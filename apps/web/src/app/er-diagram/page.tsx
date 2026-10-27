import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/mermaid-diagram";

export const metadata: Metadata = {
  title: "ER Diagram · Movie Ticketing",
  description: "Database design for the Movie Ticketing MVP",
};

const docsDir = path.join(process.cwd(), "..", "..", "docs");

export default function ErDiagramPage() {
  // Read inside the component: once at `next build` for the static export, on every request in `next dev`.
  const erDiagram = readFileSync(path.join(docsDir, "er-diagram.mmd"), "utf-8");
  const designNotes = readFileSync(path.join(docsDir, "database-design.md"), "utf-8");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Database design · MVP
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">ER Diagram</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Source: <code>docs/er-diagram.mmd</code>. Edit the file and refresh to see changes.
        </p>
      </header>

      <MermaidDiagram chart={erDiagram} />

      <article className="prose prose-neutral mt-12 max-w-none dark:prose-invert">
        <Markdown remarkPlugins={[remarkGfm]}>{designNotes}</Markdown>
      </article>
    </main>
  );
}
