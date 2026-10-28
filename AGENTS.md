# AGENTS.md — onboarding for humans and AI agents

Read this file first. It explains what's built, what's in flight, what's next, how agents coordinate, and the rules
every change must follow. `plan.md` holds the full checklist and the decisions log, and wins if the two disagree.

## 1. The project in one paragraph

A production-grade movie ticketing web app for Thailand. Customers browse movies in **Thai (default) or English**,
pick 1–4 seats, log in, pay within 5 minutes by **card or PromptPay QR** (Stripe test mode, THB), and get a ticket QR.
It's a learning project for backend, AWS and DevOps, so we choose the production-grade option even when it's more
work, as long as it genuinely helps. The product owner (the user) owns product/UX decisions; engineering quality
improvements inside a task are applied without asking, but **summarize and ask before starting a new phase**.

## 2. Current status (update when an item is merged)

| Area               | State                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0: Design    | ✅ ER diagram, DB design, OpenAPI contract, security doc, decisions log                                                                                                                                                                                                    |
| Repo / DevOps      | ✅ Turborepo, shared TS + ESLint configs, Prettier, Husky, commitlint, CI workflow + Dependabot (**written, never run: repo not on GitHub yet**)                                                                                                                           |
| Design system      | ✅ "Marquee" theme + cinema components, **approved** (`/design-system`)                                                                                                                                                                                                    |
| Database           | ✅ Prisma schema, hand-written constraints, roles (`migrator` / `app_user`) with **grants in a migration**, 26/26 constraint checks. ✅ Seeded with **18 real TMDB movies** (`movies.json`), 2 cinemas, 6 halls, 992 seats, 913 showtimes (31 days), demo user             |
| API foundation     | ✅ Validated env, PrismaService (app_user, pool), pino + request id + redaction, contract error filter, strict nestjs-zod validation, Swagger (dev), helmet/CORS/limits, health live/ready + graceful drain, Testcontainers harness                                        |
| Auth API (Phase 2) | ✅ register / login / refresh / logout / me, argon2id, JWT (jose, HS256 pinned), rotating refresh cookie + family revocation (10 s racing-tab grace), Origin guard, rate limits. **Verified end to end with the real web** (`dev:api`)                                     |
| Clickable demo     | ✅ Every customer screen on a stateful, contract-faithful **mock API** (TH/EN): browse → seats → login → checkout (demo card / PromptPay) → ticket QR → my bookings, active-booking banner, back-block, time's up, seat taken, cross-tab refresh lock, Demo controls panel |
| Tests              | 202 api unit · 32 api integration (real Postgres) · 264 web unit · 26 DB checks. All green                                                                                                                                                                                 |

**Phase 1 + 2 wrapped up (2026-10-28).** Auth was then walked in the browser against the real API (register, reload
restore, two tabs, logout, wrong password, duplicate email); this added `GuestOnly` on /login and /register. Last merge added real TMDB posters in the demo (one movie source:
`movies.json` → `npm run mocks:sync-movies -w web` → `src/mocks/movies.fixture.json`; root `npm run movies:fetch`
does fetch + sync + seed) and the **optimistic seat map** (`features/bookings/use-booking-mutations.ts`,
`features/showtimes/seat-cache.ts`): Buy previews seats as held, rollback + apology toast on `SEAT_TAKEN`, occupied
seats use the person icon (S8), Demo control "Slow network (1.5 s)". The product owner may come back to revise these
phases.

**Next (needs product-owner go-ahead):** Phase 3 catalog API (`listGenres`, `listCinemas`, `listMovies`,
`getMovie`, `listMovieShowtimes`) + the **contract test** (Nest OpenAPI vs `docs/openapi.yaml`) + a **CI integration
job**, then switch the catalog screens from mocks to the real API. Then Phase 4 (booking API), 5 (Stripe), 6 (tickets).

**Open questions for the product owner:** when to push to a private GitHub repo (so CI runs). Storybook was
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

## 4. Repo map

```
apps/web                Next.js 16 (App Router, output: "export" → static files for S3 + CloudFront)
  src/app/[locale]/     thin routes: home, movies, movie, showtime, login, register, checkout(+/complete), bookings, booking
  src/app/(dev)/        page.dev.tsx review pages (er-diagram, openapi, design-system), only with INCLUDE_DEV_PAGES=1
  src/features/         auth, movies, showtimes, bookings, payments (components, hooks, schemas, tests)
  src/components/       ui/ (shadcn, vendored) · cinema/ (seat, seat map, ratings, countdown, banner, cards) · shell/
  src/lib/              api-client (+ transport, session refresh, server clock), format, seat rules, safe redirect
  src/mocks/            stateful mock API (catalog, db in sessionStorage, service rules, handlers, demo controls)
  src/api/generated/    orval output from docs/openapi.yaml (committed, never edited)
  messages/             th.json, en.json (typed; every ErrorCode translated)
  scripts/finalize-build.mjs  fails the build if dev pages or mock code reach out/
apps/api                NestJS 12 (ESM, nodenext, Vitest + SWC)
  src/                  config, prisma, common (errors, logging, validation, time, rate-limit), health, auth, booking/booking.config.ts
  prisma/schema.prisma  + migrations/ (init, db_constraints, movie_poster_nullable, app_user_grants)
  prisma/seed/          movies.json (TMDB snapshot), movies.sample.json, fetch-movies, run-seed, schedule, pricing, layout
  test/                 Testcontainers integration specs (health, seed, auth)
packages/tsconfig, packages/eslint-config   shared strict configs
docs/                   design docs (see §3) · docker/  Postgres init (roles + databases)
```

## 5. Multi-agent workflow

**Roles.** **Lead / reviewer** (main session): briefs, reviews, merges into `main`, owns `docs/`, `plan.md`, this
file, and talks to the product owner. **Frontend agent:** `apps/web/**`. **Backend agent:** `apps/api/**`,
`docker/**`, `docker-compose.yml`, `.env.example` files. Each agent runs in its own git worktree
(`.claude/worktrees/…`, git-ignored).

**Rules**

1. **One plan item at a time.** Do exactly the brief, commit, report, then **stop**.
2. Before starting: `git merge main`, `npm ci`, and for api work `npm run db:generate -w api`.
3. **File ownership is strict.** Shared files (root `package.json`, lockfile, `turbo.json`, `.gitignore`,
   `.github/**`) only when the brief says so, and list them in the report. Docs belong to the lead.
4. Doc mismatch or better idea → report it under "Deviations", don't edit docs.
5. Product decisions (business rules, UX, scope) → raise them, don't decide them.
6. Never `--no-verify`, never force-push, never commit secrets. Leave the shared Postgres container running.

**Definition of done:** matches the brief and docs · **unit tests ship with the code** (no placeholders) ·
`npm run check` passes · DB/API work ran `npm run db:verify` / `npm run test:int -w api` · UI work checked in a browser
incl. 375px · one Conventional Commit with the session's co-author trailer.

**Report template:** branch + hash · what changed · public APIs · tests added + results · deviations · shared files
touched · what to look at closely.

**Lead review checklist:** read the risky code (not just the report) · merge with `chore: merge …` · after a merge run
`npm install`, `npm run db:generate -w api`, `npm run check`, and `npm run test:int -w api` when api changed ·
look at UI in the browser pane · fix small issues on `main`, send bigger ones back · update §2 and `plan.md`.

## 6. Commands

```bash
npm ci                         # install (Node 24, see .nvmrc)
npm run check                  # format + spec lint + lint + typecheck + test + build (all workspaces)
npm run dev:mock -w web        # web on :3000 with the mock API (what the product owner looks at)
npm run dev:web                # web on :3000 without mocks (agents: append -- -p 3100)
npm run dev:api -w web         # web on :3000 talking to the real API on :4000 (start it: npm run dev -w api)
npm run db:up                  # Postgres on 127.0.0.1:5433, waits until healthy
npm run db:migrate             # prisma migrate dev (as migrator)
npm run db:seed                # idempotent seed (only adds; never changes/deletes showtimes)
npm run db:verify              # 26 constraint + privilege checks, rolled back
npm run db:studio              # Prisma Studio (launch config "db-studio" on :5555)
npm run seed:fetch-movies -w api  # TMDB → prisma/seed/movies.json (needs TMDB_API_KEY in root .env)
npm run test:int -w api        # integration tests (Docker; not part of check)
npm run api:generate -w web    # regenerate the orval client after docs/openapi.yaml changes
npm run lint:openapi           # lint the contract
```

Ports: web 3000 (lead preview) / 3100 (agents), api 4000, Postgres 5433, Prisma Studio 5555.
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
- Catalog/booking screens show "could not load" under `dev:api` until Phases 3–4 ship those endpoints. Expected.
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
