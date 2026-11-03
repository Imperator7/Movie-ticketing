#!/usr/bin/env node
// Code knowledge graph (graphify), always offline: code is parsed locally with tree-sitter, no LLM, no API key,
// no query log. Used by the `codebase-graph` skill and, through MCP, by agents directly. Works on macOS, Linux
// and Windows (no bash needed).
//
//   npm run graph:install                        once per machine: pinned graphify in its own virtualenv
//   npm run graph:build                          build/refresh graphify-out/ (~10 s)
//   npm run graph -- search "seat lock"          keyword search (alias of `query`)
//   npm run graph -- explain "CatalogService"    one symbol and what it touches
//   npm run graph -- path "AuthController" "PrismaService"
//   npm run graph -- affected "cancelPendingBooking"   what depends on it (blast radius)
//   node scripts/graph.mjs mcp                   MCP stdio server (started by .mcp.json, not by hand)

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pinned on purpose (supply chain): graphify releases almost daily, so upgrade deliberately, to a version that has
 * been out for a couple of weeks, and rebuild the graph after.
 */
const GRAPHIFY_VERSION = "0.9.91";
const GRAPHIFY_EXTRAS = "sql,mcp,terraform";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const venv = path.join(os.homedir(), ".local", "share", "graphify", "venv");
const venvBin = path.join(venv, isWindows ? "Scripts" : "bin");
const graphJson = path.join(root, "graphify-out", "graph.json");

// No LLM backend and no query log, whatever API keys happen to be in the environment.
const env = { ...process.env, GRAPHIFY_BACKEND: "none", GRAPHIFY_QUERY_LOG_DISABLE: "1" };

/** The pinned venv first; then whatever is on PATH. */
function tool(name) {
  const local = path.join(venvBin, isWindows ? `${name}.exe` : name);
  if (existsSync(local)) return local;
  const which = spawnSync(isWindows ? "where" : "which", [name], { encoding: "utf8" });
  return which.status === 0 ? which.stdout.split(/\r?\n/)[0].trim() : null;
}

/** Runs a command with the terminal attached; returns its exit code. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

function install() {
  const python = isWindows ? "python" : "python3";
  if (!existsSync(venvBin)) {
    const code = run(python, ["-m", "venv", venv]);
    if (code !== 0) return code;
  }
  const pip = path.join(venvBin, isWindows ? "python.exe" : "python");
  return run(pip, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    `graphifyy[${GRAPHIFY_EXTRAS}]==${GRAPHIFY_VERSION}`,
  ]);
}

const [command, ...rest] = process.argv.slice(2);

if (command === "install") process.exit(install());

const graphify = tool("graphify");
if (!graphify) {
  process.stderr.write(
    "graphify is not installed. Install the pinned version once with: npm run graph:install\n" +
      `(official PyPI package "graphifyy", two y's, version ${GRAPHIFY_VERSION}, into ${venv})\n`,
  );
  process.exit(127);
}

if (command === "build") {
  const extracted = run(graphify, ["extract", ".", "--code-only"]);
  if (extracted !== 0) process.exit(extracted);
  process.exit(run(graphify, ["cluster-only", ".", "--no-label"]));
}

if (!existsSync(graphJson)) {
  process.stderr.write("No graph yet: run npm run graph:build first (~10 s).\n");
  process.exit(1);
}

if (command === "mcp") {
  const server = tool("graphify-mcp");
  if (!server) {
    process.stderr.write(
      "graphify-mcp is missing: rerun npm run graph:install (needs the mcp extra).\n",
    );
    process.exit(127);
  }
  // stdio stays attached: the MCP client talks to the server over this process's stdin/stdout.
  process.exit(run(server, [graphJson]));
}

// `search` reads better for agents; it is graphify's keyword/BFS `query`.
const args = command === "search" ? ["query", ...rest] : [command, ...rest].filter(Boolean);
process.exit(run(graphify, args.length > 0 ? args : ["--help"]));
