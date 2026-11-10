# AGENTS.md — onboarding for humans and AI agents

Read this file first. It explains what's built, what's in flight, what's next, how work is done, and the rules
every change must follow. `plan.md` holds the full checklist and the decisions log, and wins if the two disagree.

## 1. The project in one paragraph

A production-grade movie ticketing web app for Thailand. Customers browse movies in **Thai (default) or English**,
pick 1–4 seats, log in, pay within 5 minutes by **card or PromptPay QR** (Stripe test mode, THB), and get a ticket QR.
It's a learning project for backend, AWS and DevOps, so we choose the production-grade option even when it's more
work, as long as it genuinely helps. The product owner (the user) owns product/UX decisions; engineering quality
improvements inside a task are applied without asking, but **summarize and ask before starting a new phase**.

**Docs are updated only when the product owner says so** (rule from the product owner, 2026-11-03: doc updates
are costly). This covers `AGENTS.md`, `plan.md`, `README.md`, `docs/*.md`, `docs/er-diagram.mmd`,
`infra/README.md`, `plan-infra.md` and the skills. Don't update them as part of a task. When a change makes them out of date, end
your turn by **asking** whether to update them, with a one-line list of what is stale. On a yes, follow the
`update-docs` skill. Exception: `docs/openapi.yaml` changes together with the code when an endpoint changes,
because the contract tests and the generated client read it.

## 2. Current status (updated only when the product owner asks, see §1)

| Area               | State                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0: Design    | ✅ ER diagram, DB design, OpenAPI contract, security doc, decisions log                                                                                                                                                                                                                                                                                                                                                        |
| Repo / DevOps      | ✅ Turborepo, shared TS + ESLint configs, Prettier, Husky, commitlint, CI workflow + Dependabot on GitHub, Deploy workflow (OIDC → AWS), run by hand while AWS is parked                                                                                                                                                                                                                                                       |
| Design system      | ✅ "Marquee" theme + cinema components, **approved** (`/design-system`)                                                                                                                                                                                                                                                                                                                                                        |
| Database           | ✅ Prisma schema, hand-written constraints, roles (`migrator` / `app_user`) with **grants in a migration**, 26/26 constraint checks. ✅ Seeded with **18 real TMDB movies** (`movies.json`), 2 cinemas, 6 halls, 992 seats, 913 showtimes (31 days), demo user                                                                                                                                                                 |
| API foundation     | ✅ Validated env, PrismaService (app_user, pool), pino + request id + redaction, contract error filter, strict nestjs-zod validation, Swagger (dev), helmet/CORS/limits, health live/ready + graceful drain, Testcontainers harness                                                                                                                                                                                            |
| Auth API (Phase 2) | ✅ register / login / refresh / logout / me, argon2id, JWT (jose, HS256 pinned), rotating refresh cookie + family revocation (10 s racing-tab grace), Origin guard, rate limits. **Verified end to end with the real web** (`dev:api`)                                                                                                                                                                                         |
| Clickable demo     | ✅ Every customer screen on a stateful, contract-faithful **mock API** (TH/EN): browse → seats → login → checkout (demo card / PromptPay) → ticket QR → my bookings, active-booking banner, back-block, time's up, seat taken, cross-tab refresh lock, Demo controls panel                                                                                                                                                     |
| Catalog (Phase 3)  | ✅ genres / cinemas / movies (filters, TH+EN search, pages) / movie / showtimes (Bangkok days, `seatsLeft`), Cache-Control, **contract test** (allowlist in `apps/api/src/contract/implemented-operations.ts`, add ids each phase), CI integration job. Web catalog screens run on the real API                                                                                                                                |
| Booking (Phase 4)  | ✅ API: showtime detail, live seat map, createBooking (Idempotency-Key, one transaction, sorted seat locks, server pricing, events), active/my/one booking, cancel (PaymentGateway port, no-op until Stripe), expiry job (30 s, advisory lock). ✅ Seat map keyboard, labels, pinch/zoom. ✅ Web seat map, checkout hold, banner and bookings run on the real API (walked by the lead: book → held for others → cancel → free) |
| Payments (Phase 5) | ✅ createPaymentIntent (reused per booking, provider idempotency key), signed webhook (`stripe_events` dedupe, amount check, guarded confirm, late/duplicate payment → refund, failed/canceled), PaymentGateway on the provider. `PAYMENTS_PROVIDER` = `stripe` or `fake`; the fake runs `/__demo/pay` through the same webhook handler. Web: Stripe Payment Element for a `pk_` key, demo panel otherwise                     |
| Tickets (Phase 6)  | ✅ Ticket QR, `/bookings`, `/booking?id=` on the real API (walked: seats → login → pay → ticket → my bookings)                                                                                                                                                                                                                                                                                                                 |
| Stack (Phase 7–8)  | ✅ `apps/api/Dockerfile`, `apps/web/Dockerfile` (nginx, CSP, `/api` proxy), compose `stack` profile (`npm run stack:up` → :8080), Playwright `e2e/` (8 passing), README. Sentry not wired yet                                                                                                                                                                                                                                  |
| Tests              | 358 api unit · 240 api integration · 466 web unit · 8 e2e (not in CI) (api integration incl. **runtime OpenAPI conformance** on the 21 live operations, real concurrency tests, an **access-control matrix** and the **Stripe path over HTTP** against a local fake Stripe) · 26 DB checks. All green. `npm run test:report` → `/test-report`                                                                                  |

**Phase 1 + 2 wrapped up (2026-10-28).** Auth was then walked in the browser against the real API (register, reload
restore, two tabs, logout, wrong password, duplicate email); this added `GuestOnly` on /login and /register. Last merge added real TMDB posters in the demo (one movie source:
`movies.json` → `npm run mocks:sync-movies -w web` → `src/mocks/movies.fixture.json`; root `npm run movies:fetch`
does fetch + sync + seed) and the **optimistic seat map** (`features/bookings/use-booking-mutations.ts`,
`features/showtimes/seat-cache.ts`): Buy previews seats as held, rollback + apology toast on `SEAT_TAKEN`, occupied
seats use the person icon (S8), Demo control "Slow network (1.5 s)". The product owner may come back to revise these
phases.

**Phases 5–8 done (2026-10-30)** on branch `feat/mvp-phase-5-8`, except Sentry and real Stripe keys. Images were
not built in the session that wrote them (no Docker Hub there): the first `npm run stack:up` is their real test.

**Phase 4 done (2026-10-28).** Dev map of screens, pipeline and live operations: `/flow`.

**AWS demo parked (2026-11-10).** It ran in the first AWS account from 2026-10-30 (last deploy 2026-11-06). The
product owner moved to a new account (IAM Identity Center, SSO only, no IAM user keys); nothing is deployed there
yet and the old URL is gone. Terraform stays in `infra/` and will need changes for the move (`infra/README.md`
lists them). The Deploy workflow no longer runs after CI; it is manual until the new account is up.

**Phase 7 tests merged (2026-11-10)** from `test/phase-7-coverage`: Stripe path over HTTP (fake Stripe server), IDOR
matrix, payment rules as pure functions, two reliability fixes (D11), amount mismatch → refund + cancel
(`AMOUNT_MISMATCH_REFUNDED`), "my bookings" = paid tickets only, Windows fixes for `test:report`.

**Repo cleanup (2026-11-10):** no subagents for now (S10), so the multi-agent workflow and its two skills are gone.
Removed `infra/HANDOFF.md` and `docs/deploy-aws.md` (both described the old account). Dependabot opens at most two
grouped PRs a week and skips major npm versions.

**Next (product owner, 2026-11-10): finish the app on the local Docker stack** (`npm run stack:up`), plan item
by plan item, then move it to AWS. Order of the items (2026-11-03): (1) UI fixes, from the product owner's walk-through list;
(2) Stripe test mode end to end with real test keys (Phase 5 open item); (3) payment reliability: a daily
reconciliation job (Stripe vs database) and CloudWatch alarms; (4) Sentry; (5) email via SES with an outbox table
(verification, password reset, e-ticket); then LINE / Google login. The AWS-only parts (CloudWatch alarms, SES,
`terraform plan` on PRs, path-filtered deploys, custom domain) wait for the new account.

**Open questions for the product owner:** which UI screens to fix first. Seed data: movie
`status` doesn't match showtimes (a COMING_SOON movie has showtimes today). "Can't reach the server" message
instead of the generic error? Storybook was
dropped (S9).

## 3. Source of truth

| Topic                                                                | File                                                     | Rendered (dev only) |
| -------------------------------------------------------------------- | -------------------------------------------------------- | ------------------- |
| Plan, phase checklists (`🧪` = built on mocks), decisions log        | `plan.md`                                                | –                   |
| Database schema                                                      | `docs/er-diagram.mmd` → `apps/api/prisma/schema.prisma`  | `/er-diagram`       |
| DB rules: seat locks, booking lifecycle, constraints, token families | `docs/database-design.md`                                | `/er-diagram`       |
| API contract (endpoints, schemas, `ErrorCode`)                       | `docs/openapi.yaml`                                      | `/openapi`          |
| Security controls (WEB-\*, API-\*, DB-\*, OPS-\*)                    | `docs/security.md`                                       | –                   |
| Design tokens + components                                           | `apps/web/src/app/globals.css`, `src/components/cinema/` | `/design-system`    |

**Contract first:** if code and docs disagree, the docs win unless you can show they're wrong. Then report it.

## 3a. Skills (load on demand, `.claude/skills/`)

Claude loads a skill when its description matches the task.

| Skill                 | Load when                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-system`       | any UI change in apps/web (Marquee rules, when to use impeccable)                                                                                     |
| `impeccable`          | deliberate design review/polish: `/impeccable critique`, `audit`, `harden`, `polish`                                                                  |
| `database-workflow`   | schema, migrations, grants, seed, resets                                                                                                              |
| `api-contract-change` | adding/changing an endpoint or field                                                                                                                  |
| `update-docs`         | only when the product owner says to update the docs: what each doc holds, how to find what's stale, how to edit them cheaply                          |
| `codebase-graph`      | finding code across packages and `infra/`, tracing relationships, blast radius (`npm run graph:build`, offline; MCP server `graphify` in `.mcp.json`) |

No always-on hooks: graphify and impeccable hooks were removed on purpose (product owner: "only when needed").

## 4. Repo map

```
apps/web                Next.js 16 (App Router, output: "export" → static files for S3 + CloudFront)
  src/app/[locale]/     thin routes: home, movies, movie, showtime, login, register, checkout(+/complete), bookings, booking
  src/app/(dev)/        page.dev.tsx review pages (er-diagram, openapi, design-system, flow, api-flow, critical-flows,
                        test-report), only with INCLUDE_DEV_PAGES=1
  src/features/         auth, movies, showtimes, bookings, payments, dev-api-flow (components, hooks, schemas, tests)
  src/components/       ui/ (shadcn, vendored) · cinema/ (seat, seat map, ratings, countdown, banner, cards) · shell/
  src/lib/              api-client (+ transport, session refresh, server clock), format, seat rules, safe redirect
  src/mocks/            stateful mock API (catalog, db in sessionStorage, service rules, handlers, demo controls)
  src/api/generated/    orval output from docs/openapi.yaml (committed, never edited)
  messages/             th.json, en.json (typed; every ErrorCode translated)
  scripts/finalize-build.mjs  fails the build if dev pages or mock code reach out/
apps/api                NestJS 12 (ESM, nodenext, Vitest + SWC)
  src/                  config, prisma, common (errors, logging, validation, time, rate-limit), health, auth, catalog,
                        showtimes, booking, payments, contract
  prisma/schema.prisma  + migrations/ (init, db_constraints, movie_poster_nullable, app_user_grants,
                        cancel_reason_amount_mismatch)
  prisma/seed/          movies.json (TMDB snapshot), movies.sample.json, fetch-movies, run-seed, schedule, pricing, layout
  test/                 Testcontainers integration specs (auth, catalog, showtimes, booking, expiry, payments, fake
                        Stripe, access control, conformance, cache, seed, health)
packages/tsconfig, packages/eslint-config   shared strict configs
e2e/                    Playwright against the Compose stack (`npm run e2e`; not in CI)
infra/                  Terraform (`envs/demo`) + deploy scripts for AWS. Parked, see §2 and infra/README.md
scripts/                graph.mjs (code graph), test-report.mjs, stack-secrets.sh
docs/                   design docs (see §3) · docker/  Postgres init (roles + databases)
```

## 5. Workflow

One session, no subagents for now (S10). The product owner decides what is next; Claude does the work and explains it.

1. **One plan item at a time**, on a branch off `main`. Finish it, show the result, then stop and ask before the next.
2. Product decisions (business rules, UX, scope) → raise them, don't decide them.
3. Doc mismatch or a better idea → say so; docs change only when the product owner asks (§1).
4. Never `--no-verify`, never force-push, never commit secrets. Leave the shared Postgres container running.

**Definition of done:** matches the plan item and the docs · **unit tests ship with the code** (no placeholders) ·
`npm run check` passes · DB/API work ran `npm run db:verify` / `npm run test:int -w api` · UI work checked in a browser
incl. 375px · Conventional Commits with the session's co-author trailer · merged into `main` with CI green.

## 6. Commands

```bash
npm ci                         # install (Node 24, see .nvmrc)
npm run check                  # format + spec lint + lint + typecheck + test + build (all workspaces)
npm run dev:mock -w web        # web on :3000 with the mock API (what the product owner looks at)
npm run dev:web                # web on :3000 without mocks (second copy: append -- -p 3100)
npm run dev:api -w web         # web on :3000 talking to the real API on :4000 (start it: npm run dev -w api)
npm run stack:up               # whole app in Docker (postgres → migrate → seed → api → web) on :8080; stack:down, stack:logs
npm run e2e                    # Playwright against the running stack
npm run db:up                  # Postgres on 127.0.0.1:5433, waits until healthy
npm run db:migrate             # prisma migrate dev (as migrator)
npm run db:seed                # idempotent seed (only adds; never changes/deletes showtimes)
npm run db:verify              # 26 constraint + privilege checks, rolled back
npm run db:studio              # Prisma Studio (launch config "db-studio" on :5555)
npm run seed:fetch-movies -w api  # TMDB → prisma/seed/movies.json (needs TMDB_API_KEY in root .env)
npm run test:int -w api        # integration tests (Docker; not part of check)
npm run api:generate -w web    # regenerate the orval client after docs/openapi.yaml changes
npm run lint:openapi           # lint the contract
npm run test:report            # every suite → reports/test-report.json → /test-report (-- --quick: unit only)
npm run graph:install          # once per machine: pinned graphify (offline code graph)
npm run graph:build            # build the graph (also used by the graphify MCP tools)
npm run graph -- search "…"     # or explain / path / affected, see the codebase-graph skill
```

Ports: web 3000 / 3100 (second copy), api 4000, Postgres 5433, Prisma Studio 5555, Compose stack 8080.
Env: copy `.env.example` → `.env` (root) and `apps/api/.env.example` → `apps/api/.env`. `TMDB_API_KEY` lives in the root `.env`.

## 7. Engineering rules (details: plan.md §5, docs/security.md)

**Everywhere:** strict TypeScript, type-aware ESLint, no `any`, no unhandled promises, Prettier (100 cols),
Conventional Commits (`feat|fix|build|docs|chore|test|refactor(scope): …`).

**Frontend:** static export (no SSR / Server Actions / middleware / `cookies()`) · server state only in TanStack Query
(optimistic updates via `onMutate` snapshot + rollback), Zustand = session only, URL = filters/date/`?seats=` · forms =
React Hook Form + `zodResolver` (extend orval Zod) · semantic tokens only, no raw palette colors or hex · Thai default,
all copy via next-intl, errors via `t("errors.<CODE>")` · accessibility: real buttons, aria, keyboard, focus,
`prefers-reduced-motion`.

**Backend:** authorization in every query (another user's resource → 404) · server computes prices, totals, statuses,
deadlines · strict Zod DTOs, every error uses the contract's `Error` + `ErrorCode` · money = whole baht integers
(Stripe adapter converts ×100) · time = `timestamptz`, Bangkok days only via `bangkokDayRange()` · guarded state
updates + `booking_events` in the same transaction, jobs take an advisory lock · app = `app_user` (DML only),
migrations = `migrator`, anything Prisma can't express goes in hand-written SQL migrations.

## 8. Gotchas we've already hit

**Next.js / web**

- Next 16 is newer than most training data: read `node_modules/next/dist/docs/` first (`apps/web/AGENTS.md`).
  Cache Components / partial prerendering are **off** (incompatible with `output: "export"`).
- The web `typecheck` runs `next typegen` first (`LayoutProps` etc. don't exist on a fresh checkout otherwise).
  Turbo runs `lint` after `typecheck` and caches `.next/types` for that reason (without them lint reports "error
  typed value").
- After reinstalling packages while `next dev` runs, Turbopack can keep stale paths ("Cannot find module …"):
  stop the server, `rm -rf apps/web/.next`, start again.
- The embedded browser pane may block service workers; in mock mode the api-client falls back to in-process MSW
  (`getResponse`) after 2.5 s.
- `DemoPaymentPanel` / `POST /__demo/pay` is a stand-in until Phase 5 Stripe and currently ships in prod builds
  (Phase 5 removes it and makes `finalize-build.mjs` reject `__demo`).
- next-intl `setRequestLocale` (deprecated) and Next `experimental.globalNotFound` are used on purpose; re-check on upgrades.
- shadcn CLI: pass `-p nova -b radix` and close stdin.

**API / database**

- Prisma client is generated and git-ignored: `npm run db:generate -w api` after `npm ci` (turbo also runs it).
- Prisma 7 (pinned stable 7.x): `prisma.config.ts`, `prisma-client` generator with ESM output, `@prisma/adapter-pg`.
  `prisma generate` works without a DB; migrate commands need `MIGRATION_DATABASE_URL`.
- API is ESM: relative imports need `.js`. Nest DI needs value (not type-only) imports. Vitest uses SWC for decorator metadata.
- **`app_user` grants live in the `app_user_grants` migration**, not only in `docker/postgres/init`: `prisma migrate
reset` drops the `public` schema and its grants. Any new role/privilege must be added in a migration too.
- **`prisma migrate reset` refuses to run from an AI agent.** Explain what will be deleted, ask the product owner
  explicitly (structured question), and only with a clear "yes" rerun with
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<their exact consent text>"`. Never on anything but the local dev DB.
- The seed **only adds** (it never changes or deletes showtimes, which could have bookings). Replacing the movie set
  therefore needs a dev DB reset (above) and then `npm run db:seed`.
- `apps/api/.env` is copied once and then drifts: when the API exits with "Invalid environment configuration", add
  the missing keys from `.env.example` (generate secrets with `openssl rand -base64 48`). Don't add an empty
  `TMDB_API_KEY=` there: dotenv won't override it, so it hides the root `.env` key.
- `fetch-movies` reads `apps/api/.env` and then the root `.env`. TMDB's Thai title falls back to the original title
  (e.g. Chinese/Hindi); `readableForThai()` treats non-Thai/non-Latin text as missing → English.
- `movies.poster_url` is nullable; no poster → the web's own placeholder. Images only from `image.tmdb.org` (future CSP).
- nestjs-zod 5.5 declares a NestJS 10–11 peer: if an `npm install -w api …` hits ERESOLVE, rerun that command with
  `--legacy-peer-deps`. No global `.npmrc`.
- Validation errors: `details.fields` = `{ "<path>": ["<zod issue code>"] }`, `_root` for whole-body, `unrecognized_key`.
- Refresh reuse within `REFRESH_REUSE_GRACE_MS` (10 s) is a plain 401 (racing tabs); later reuse revokes the family.
  The web serializes refresh across tabs with `navigator.locks`.

**Repo / tooling**

- Docker Compose has a fixed project name (`movie-ticketing`): one shared Postgres for all worktrees. Don't
  `docker compose down -v` unless asked.
- `.turbo/`, `.claude/worktrees/`, `apps/api/src/generated/` are git- and Prettier-ignored.
- Two branches touched `package-lock.json`? Don't hand-merge: `git checkout --ours package-lock.json && npm install`,
  then `npm run check`. Declare peer deps explicitly (e.g. `@testing-library/dom`) or a rebuilt lockfile drops them.
- commitlint has no `merge:` type; use `chore: merge …`. `gitleaks` may be missing locally (hook warns; CI scans).
- **Windows machine:** npm runs scripts with `cmd`, so the web dev scripts (`INCLUDE_DEV_PAGES=1 next dev`) fail
  there; use the `web-windows` launch config (Git Bash). `core.autocrlf=true` checks files out with CRLF: run
  Prettier with `--end-of-line auto`, and tests that parse repo files must normalise `\r\n` (see
  `error-code.spec.ts`). `.gitattributes` forces LF for `*.sh` (a CRLF Postgres init script crashes and never
  creates the roles). The dev Postgres there runs on **port 5435** (`POSTGRES_HOST_PORT`; 5433 is another project's
  container). `npm run stack:secrets` calls `bash` (WSL there): run `bash scripts/stack-secrets.sh` from Git Bash.
  Git Bash rewrites `/paths` in `docker exec` / AWS CLI arguments: prefix `MSYS_NO_PATHCONV=1`.
