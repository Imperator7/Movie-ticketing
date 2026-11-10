---
name: codebase-graph
description: Use when you need to find where something lives across apps/web, apps/api, the migrations and the Terraform in infra/, trace how two things connect (who calls what, which module imports which, which AWS resource references which), or check the blast radius of a change before a refactor, a cross-package task or a Terraform change. Offline code knowledge graph (graphify), also available as MCP tools (`graphify` server). Skip it for edits inside a file you already know or a task fully described by the brief.
---

# Codebase graph (graphify, offline)

A knowledge graph of the code (≈3,300 nodes: functions, classes, modules, imports, calls, SQL migrations and the
Terraform resources in `infra/`), built locally with tree-sitter. No LLM, no API key, no query log: nothing leaves the
machine. Docs (`docs/*.md`, `openapi.yaml`) are not in it; read those directly.

## Two ways to use it

**MCP tools (preferred for agents).** `.mcp.json` registers the `graphify` server (`node scripts/graph.mjs mcp`).
Claude Code asks the user once to approve project MCP servers. Tools:

| Tool            | Use it for                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| `query_graph`   | Search: keyword match on symbol/file names, then a BFS around them. Pass `token_budget` |
| `get_node`      | One symbol by label or id: file, line, community                                        |
| `get_neighbors` | Everything directly connected to a symbol (callers, callees, imports, references)       |
| `shortest_path` | How two symbols connect                                                                 |
| `god_nodes`     | The most connected nodes: the core abstractions                                         |
| `get_community` | All nodes of one cluster (a feature area)                                               |
| `graph_stats`   | Node/edge counts, to check the graph is built and fresh                                 |

The `list_prs` / `get_pr_impact` / `triage_prs` tools call GitHub through `gh`; not needed for code questions.

**CLI (repo root, any OS).**

```bash
npm run graph:build                                        # build / refresh graphify-out/ (~15 s; first in a fresh worktree)
npm run -s graph -- search "refresh token rotation"        # keyword search + BFS (alias of `query`), --budget N
npm run -s graph -- explain "CatalogService"               # one symbol: file:line, everything it touches
npm run -s graph -- path "AuthController" "PrismaService"  # how two things connect
npm run -s graph -- affected "cancelPendingBooking"        # blast radius: everything that depends on it
npm run -s graph -- affected "aws_security_group.db"       # same for Terraform: resources/outputs that reference it
npm run -s graph -- god-nodes --top 15                     # architectural hubs
```

- `explain`, `path` and `affected` are the precise ones: exact files and lines, so you read only what matters.
  Run `affected` before changing a shared function or a Terraform resource.
- `search`/`query` matches symbol and file names. Use code words (`seatsLeft`, `bangkokDayRange`,
  `aws_lb.api`), not prose. It can surface the mock (`apps/web/src/mocks`) before the real API; check the `src=` path.
- Results are cut at the token budget (default 2000); the output says how much to raise it, or narrow the search.
- Ambiguous name → exit code 3 with candidates; no match → exit code 4.
- `graphify-out/GRAPH_REPORT.md`: most-connected modules and communities, for a broad architecture view.

## When the graph is stale

It's a snapshot (git-ignored). After pulling/merging or large edits: `npm run graph:build`. It doesn't know about
uncommitted renames until rebuilt. The MCP server loads the graph at start: rebuild, then restart the session's MCP
server to see the change.

## Setup (once per machine)

`npm run graph:install` creates `~/.local/share/graphify/venv` and installs the **pinned** version
(`GRAPHIFY_VERSION` in `scripts/graph.mjs`; official PyPI package `graphifyy`, two y's, extras
`sql,mcp,terraform`). `scripts/graph.mjs` is plain Node, so it works on Windows without bash. Upgrade on purpose:
bump the pin to a release that has been out for about two weeks (supply chain), reinstall, rebuild.

Never install graphify's own Claude hooks or CLAUDE.md block (`graphify install` / `graphify claude install`): they
force a graph lookup before every search, and the product owner wants it only when needed. The MCP tools are fine:
they only run when an agent calls them.
