import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AWS launch guide · Movie Ticketing",
  description: "Step by step: from the laptop and GitHub to the app running in the AWS account",
};

/** Repo-root infra/aws-learning-guide.html (the dev server runs with cwd apps/web). */
const guidePath = path.join(process.cwd(), "..", "..", "infra", "aws-learning-guide.html");

// The guide is a page fragment (title, styles, content, script). The frame gives it its own document, so its
// styles and its saved checkboxes never touch the app's.
const frameDocument = (fragment: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style></head>` +
  `<body>${fragment}</body></html>`;

// Dev-only page (only exists with INCLUDE_DEV_PAGES=1, never in the production export).
export default function AwsGuidePage() {
  // Read inside the component: on every request in `next dev`, so edits to the guide show on reload.
  if (!existsSync(guidePath)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-semibold text-foreground">AWS launch guide</h1>
        <p className="mt-2 text-muted-foreground">
          <code>infra/aws-learning-guide.html</code> was not found.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <iframe
        title="AWS launch guide"
        srcDoc={frameDocument(readFileSync(guidePath, "utf-8"))}
        className="h-[calc(100dvh-2.75rem)] w-full border-0"
      />
    </main>
  );
}
