---
name: agent-onboarding
description: Use at the start of any brief you received as a frontend or backend subagent (or when starting fresh work in a worktree), and again before you report. Setup steps for a worktree, ports, env, the definition of done and the exact report format the lead expects.
---

# Starting and finishing a brief (subagents)

AGENTS.md is already in your context (via CLAUDE.md). This is the procedure around it.

## 1. Before writing code

```bash
git merge main                      # your worktree starts from an older main
npm ci
npm run db:generate -w api          # Prisma client is generated, not committed
```

- **Env:** `apps/api/.env` is git-ignored and drifts. If the API exits with "Invalid environment configuration", copy the missing keys from `apps/api/.env.example` (secrets: `openssl rand -base64 48`). Never add an empty `TMDB_API_KEY=` line (it hides the root `.env` key).
- **Ports (agents):** web **3100**, api **4100** (`PORT=4100 npm run dev -w api`). The lead uses 3000/4000. Web against your API: in `apps/web`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:4100/api/v1 INCLUDE_DEV_PAGES=1 npx next dev -p 3100`. Mock demo: `npm run dev:mock -w web -- -p 3100`.
- **Postgres** is shared (one container, `127.0.0.1:5433`). Never `docker compose down -v`, never `prisma migrate reset` (see the `database-workflow` skill).
- Load the skill for your area: `design-system` for UI, `database-workflow` for schema/migrations/seed, `api-contract-change` for endpoints. Use `codebase-graph` when you need to find code across packages.

## 2. While working

- Only the files your role owns (AGENTS.md §5). Shared files only if the brief says so, and list them.
- Docs (`docs/`, `plan.md`, `AGENTS.md`, skills) belong to the lead: report mismatches, don't edit.
- Product decisions (rules, UX, copy, scope) → raise them in the report.
- Unit tests ship with the code. Never `--no-verify`, never force-push, never commit secrets.

## 3. Definition of done

- [ ] `npm run check` green (format, spec lint, lint, typecheck, tests, build). If it fails once on a fresh `.next`, rerun before debugging.
- [ ] API/DB work: `npm run test:int -w api` (Docker) and `npm run db:verify` if you added a migration.
- [ ] UI work: checked in the browser at 375px and desktop, light + dark, TH + EN.
- [ ] One Conventional Commit per brief item (`feat|fix|build|docs|chore|test|refactor(scope): …`, no `merge:` type) with the co-author trailer the session gives you.
- [ ] Tree clean. Dev servers stopped.

## 4. Report (the lead reads this, not your transcript)

```
Branch + commits: <branch>, <hash> <subject> (one line each)
What changed: per item, the behaviour, then the key files
Public APIs: new/changed exports, endpoints, scripts, env vars
Tests: added (what they prove) + results (counts) + what you checked in the browser/curl
Deviations: anything that differs from the brief or the docs, and why
Shared files touched: root package.json, lockfile, turbo.json, .github/**, …
Look closely at: the 2-4 riskiest spots for the reviewer
Not done / not verified: be explicit
```

Then stop. Don't start the next plan item.

## Token budget (product owner rule)

Write like caveman: short. If the `caveman` skill is available, load it.

- No narration between tool calls, no restating the brief.
- Read only the lines you need (`grep`, `sed -n a,bp`); don't re-read files you've seen.
- Long output (check, test:int, builds) goes to a log file; show only the summary line.
- Browser/screenshots only for visual UI work, and as few as possible.
- Report ≤ ~25 lines of bullets. Keep code-level precision, drop filler.
