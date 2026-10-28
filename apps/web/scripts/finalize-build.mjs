// Runs after `next build`: removes dev-only artifacts from the static export and fails the build if
// any dev page or the MSW worker is still present (security WEB-1, "mocks never ship").
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const out = path.join(import.meta.dirname, "..", "out");

// public/mockServiceWorker.js is copied into the export by Next; it is only for `npm run dev`.
rmSync(path.join(out, "mockServiceWorker.js"), { force: true });

const forbiddenPaths = [
  "er-diagram",
  "openapi",
  "design-system",
  "test-report",
  "mockServiceWorker.js",
];
const problems = forbiddenPaths.filter(
  (p) => existsSync(path.join(out, p)) || existsSync(path.join(out, `${p}.html`)),
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) yield* walk(file);
    else if (/\.(js|html|txt)$/.test(name)) yield file;
  }
}
for (const file of walk(out)) {
  const text = readFileSync(file, "utf8");
  if (text.includes("mockServiceWorker") || text.includes("setupWorker")) {
    problems.push(`${path.relative(out, file)} references the MSW worker`);
  }
}

if (problems.length > 0) {
  console.error(`Production export contains dev-only content:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("finalize-build: no dev pages or MSW worker in out/");
