---
name: codebase-graph
description: Use when you need to find where something lives across apps/web, apps/api and the migrations, trace how two things connect (who calls what, which module imports which), or check the blast radius of a change before a refactor or a cross-package task. Offline code knowledge graph (graphify). Skip it for edits inside a file you already know or a task fully described by the brief.
---

# Codebase graph (graphify, offline)

A knowledge graph of the code (≈2,000 nodes: functions, classes, modules, imports, calls, SQL migrations), built locally with tree-sitter. No LLM, no API key, no query log: nothing leaves the machine. Docs (`docs/*.md`, `openapi.yaml`) are not in it; read those directly.

## Commands (repo root)

```bash
npm run graph:build                                   # build / refresh graphify-out/ (~10 s; do it first in a fresh worktree)
npm run -s graph -- explain "CatalogService"          # one symbol: file:line, everything it touches
npm run -s graph -- path "AuthController" "PrismaService"   # how two things connect
npm run -s graph -- query "refresh token rotation"    # BFS around matching names (keyword match, not semantic)
```

- `explain` and `path` are the precise ones: exact files and lines, so you read only what matters.
- `query` matches symbol and file names. Use code words (`seatsLeft`, `bangkokDayRange`), not prose. It can surface the mock (`apps/web/src/mocks`) before the real API; check the `src=` path.
- Ambiguous name → exit code 3 with candidates; pick one and rerun.
- `graphify-out/GRAPH_REPORT.md`: most-connected modules and communities, for a broad architecture view.

## When the graph is stale

It's a snapshot (git-ignored). After pulling/merging or large edits: `npm run graph:build`. It doesn't know about uncommitted renames until rebuilt.

## Setup (once per machine)

`scripts/graph.sh` finds `graphify` on PATH or in `~/.local/share/graphify/venv`. If missing, the script prints the install command (official PyPI package `graphifyy`, two y's). Never install graphify's own Claude hooks or CLAUDE.md block (`graphify install`/`graphify claude install`): they force a graph lookup before every search, and the product owner wants it only when needed.
