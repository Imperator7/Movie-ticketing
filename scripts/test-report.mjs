#!/usr/bin/env node
// Runs every test suite and writes one report for the dev page /test-report.
//
//   npm run test:report            all suites (needs Docker for integration + the dev DB for db:verify)
//   npm run test:report -- --quick unit suites only (no Docker, no DB)
//
// Output: reports/test-report.json (git-ignored). The shape is `TestReport` below; the web page and the
// API conformance test (which writes reports/conformance.json) both follow it. A failing suite still
// produces a report; the script then exits 1.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {"passed" | "failed" | "skipped"} Status
 *
 * @typedef {object} TestCase
 * @property {string} name          test title
 * @property {string[]} ancestors   describe() titles, outermost first
 * @property {Status} status
 * @property {number | null} durationMs
 * @property {string | null} failure first failure message (trimmed), null when not failed
 *
 * @typedef {object} TestFile
 * @property {string} file          repo-relative path
 * @property {Status} status
 * @property {TestCase[]} tests
 *
 * @typedef {object} Suite
 * @property {string} id            "api-unit" | "api-integration" | "web-unit" | "db-verify"
 * @property {string} label
 * @property {string} command       how to run it yourself
 * @property {Status} status        skipped = not run (e.g. --quick)
 * @property {number} durationMs
 * @property {{ total: number, passed: number, failed: number, skipped: number }} totals
 * @property {TestFile[]} files
 * @property {string | null} error  output tail when the suite crashed before reporting
 *
 * @typedef {object} ConformanceCheck
 * @property {string} name          e.g. "200 default page", "422 pageSize too big"
 * @property {string} request       e.g. "GET /api/v1/movies?pageSize=99"
 * @property {number} expectedStatus
 * @property {number} actualStatus
 * @property {Status} status
 * @property {string[]} errors      schema violations / status mismatch / missing headers; [] when passed
 *
 * @typedef {object} ConformanceOperation
 * @property {string} operationId
 * @property {string} method        upper case
 * @property {string} path          as in docs/openapi.yaml
 * @property {string} tag
 * @property {boolean} implemented  in apps/api/src/contract/implemented-operations.ts
 * @property {Status} status        skipped when not implemented
 * @property {ConformanceCheck[]} checks
 *
 * @typedef {object} Conformance
 * @property {string} specVersion   info.version of docs/openapi.yaml
 * @property {ConformanceOperation[]} operations  every operation in the spec, implemented or not
 *
 * @typedef {object} TestReport
 * @property {1} schemaVersion
 * @property {string} generatedAt   ISO timestamp
 * @property {{ commit: string, branch: string, dirty: boolean }} git
 * @property {boolean} quick
 * @property {Status} status        failed if any suite failed
 * @property {Suite[]} suites
 * @property {Conformance | null} conformance  null when integration tests did not run
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "reports");
const quick = process.argv.includes("--quick");

mkdirSync(outDir, { recursive: true });
const conformancePath = path.join(outDir, "conformance.json");
rmSync(conformancePath, { force: true });

/** @param {string} file */
const rel = (file) => path.relative(root, file);

/** @param {string} status @returns {Status} */
function toStatus(status) {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  return "skipped";
}

/** @param {TestCase[]} tests */
function totalsOf(tests) {
  const count = (/** @type {Status} */ s) => tests.filter((t) => t.status === s).length;
  return {
    total: tests.length,
    passed: count("passed"),
    failed: count("failed"),
    skipped: count("skipped"),
  };
}

/** Runs a vitest suite with the JSON reporter and normalises its output. */
function vitestSuite({ id, label, workspace, script, env = {} }) {
  const jsonPath = path.join(outDir, `${id}.vitest.json`);
  rmSync(jsonPath, { force: true });
  const command = `npm run ${script} -w ${workspace}`;
  if (quick && id === "api-integration") return skipped({ id, label, command });

  const started = Date.now();
  const run = spawnSync(
    "npm",
    [
      "run",
      script,
      "-w",
      workspace,
      "--",
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${jsonPath}`,
    ],
    {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const durationMs = Date.now() - started;
  process.stdout.write(
    `${run.status === 0 ? "✔" : "✖"} ${label} (${Math.round(durationMs / 1000)} s)\n`,
  );

  if (!existsSync(jsonPath)) {
    return {
      id,
      label,
      command,
      status: "failed",
      durationMs,
      totals: totalsOf([]),
      files: [],
      error: tail(run),
    };
  }
  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  rmSync(jsonPath, { force: true });

  /** @type {TestFile[]} */
  const files = raw.testResults.map((/** @type {any} */ file) => {
    /** @type {TestCase[]} */
    const tests = file.assertionResults.map((/** @type {any} */ t) => ({
      name: t.title,
      ancestors: t.ancestorTitles ?? [],
      status: toStatus(t.status),
      durationMs: typeof t.duration === "number" ? Math.round(t.duration) : null,
      failure: t.failureMessages?.length ? String(t.failureMessages[0]).slice(0, 4000) : null,
    }));
    const fileFailed = file.status === "failed" || tests.some((t) => t.status === "failed");
    return { file: rel(file.name), status: fileFailed ? "failed" : "passed", tests };
  });
  files.sort((a, b) => a.file.localeCompare(b.file));
  const totals = totalsOf(files.flatMap((f) => f.tests));
  const status = run.status === 0 && totals.failed === 0 ? "passed" : "failed";
  return {
    id,
    label,
    command,
    status,
    durationMs,
    totals,
    files,
    error: status === "failed" && totals.failed === 0 ? tail(run) : null,
  };
}

/** db:verify prints one `NOTICE:  PASS|FAIL: <check>` line per check. */
function dbVerifySuite() {
  const id = "db-verify";
  const label = "Database constraints + privileges";
  const command = "npm run db:verify";
  if (quick) return skipped({ id, label, command });

  const started = Date.now();
  const run = spawnSync("npm", ["run", "db:verify"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const durationMs = Date.now() - started;
  const output = `${run.stdout}\n${run.stderr}`;
  /** @type {TestCase[]} */
  const tests = [...output.matchAll(/NOTICE:\s+(PASS|FAIL):\s+(.+)/g)].map((m) => ({
    name: m[2].trim(),
    ancestors: [],
    status: m[1] === "PASS" ? "passed" : "failed",
    durationMs: null,
    failure: m[1] === "FAIL" ? m[2].trim() : null,
  }));
  const totals = totalsOf(tests);
  const status = run.status === 0 && totals.failed === 0 && tests.length > 0 ? "passed" : "failed";
  process.stdout.write(`${status === "passed" ? "✔" : "✖"} ${label}\n`);
  return {
    id,
    label,
    command,
    status,
    durationMs,
    totals,
    files: [{ file: "apps/api/prisma/verify", status, tests }],
    error: status === "failed" && totals.failed === 0 ? tail(run) : null,
  };
}

function skipped({ id, label, command }) {
  process.stdout.write(`– ${label} (skipped: --quick)\n`);
  return {
    id,
    label,
    command,
    status: "skipped",
    durationMs: 0,
    totals: totalsOf([]),
    files: [],
    error: null,
  };
}

/** @param {{ stdout: string, stderr: string }} run */
function tail(run) {
  return `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const suites = [
  vitestSuite({
    id: "api-unit",
    label: "API unit (incl. contract test)",
    workspace: "api",
    script: "test",
  }),
  vitestSuite({
    id: "api-integration",
    label: "API integration (real Postgres, incl. OpenAPI conformance)",
    workspace: "api",
    script: "test:int",
    env: { TEST_REPORT_DIR: outDir },
  }),
  vitestSuite({ id: "web-unit", label: "Web unit", workspace: "web", script: "test" }),
  dbVerifySuite(),
];

const conformance = existsSync(conformancePath)
  ? JSON.parse(readFileSync(conformancePath, "utf8"))
  : null;
const conformanceFailed =
  conformance?.operations?.some((/** @type {any} */ op) => op.status === "failed") ?? false;

/** @type {TestReport} */
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  git: {
    commit: git("rev-parse", "--short", "HEAD"),
    branch: git("branch", "--show-current"),
    dirty: git("status", "--porcelain") !== "",
  },
  quick,
  status: suites.some((s) => s.status === "failed") || conformanceFailed ? "failed" : "passed",
  suites,
  conformance,
};

writeFileSync(path.join(outDir, "test-report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `\nReport: ${rel(path.join(outDir, "test-report.json"))} (${report.status}). Open /test-report in the dev web.\n`,
);
process.exit(report.status === "passed" ? 0 : 1);
