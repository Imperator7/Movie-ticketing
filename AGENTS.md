# AGENTS.md — onboarding for humans and AI agents

Read this file first. It explains how the project works, how agents coordinate, and the rules every change must follow.
`plan.md` holds the detailed checklist and the decisions log, and wins if the two ever disagree.

## 1. The project in one paragraph

A production-grade movie ticketing web app for Thailand. Customers browse movies in **Thai (default) or English**,
pick 1–4 seats, log in, pay within 5 minutes by **card or PromptPay QR** (Stripe test mode, THB), and get a ticket QR.
It's a learning project for backend, AWS and DevOps, so we choose the production-grade option even when it's more
work, as long as it genuinely helps.

## 2. Current status

Update this table when an item is merged. Details live in `plan.md` §4.

| Area               | State                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0: Design    | ✅ Done: ER diagram, DB design, OpenAPI contract, security doc, grilling decisions                                                                                                                                                                                                |
| Repo / DevOps      | ✅ Turborepo, shared TS + ESLint configs, Prettier, Husky, commitlint, CI workflow (not yet pushed to GitHub), Dependabot                                                                                                                                                         |
| Design system      | ✅ "Marquee" theme + cinema components, **approved** (`/design-system`)                                                                                                                                                                                                           |
| Database           | ✅ Prisma schema, hand-written constraints, roles (`migrator` / `app_user`), 26/26 constraint checks. ✅ Idempotent seed (2 cinemas, 6 halls, 992 seats, 31 days of showtimes) from `movies.sample.json`. ⏳ Real movies need `TMDB_API_KEY` → `npm run seed:fetch-movies -w api` |
| API foundation     | ✅ Config (validated env), PrismaService (app_user, pool), pino + request id + redaction, contract error filter, nestjs-zod strict validation, Swagger (dev), helmet/CORS/limits, health live/ready + graceful drain, Testcontainers harness. 67 unit + 3 integration tests       |
| Web foundation     | ✅ next-intl `/th` `/en` (typed messages, all error codes), React Query, api-client (bearer, request id, single-flight refresh), Zustand session, orval client + Zod + MSW mocks (committed), app shell, dev pages excluded from prod. 115 web tests                              |
| Auth (Phase 2 API) | ✅ register/login/refresh/logout/me, argon2id, JWT (jose, HS256 pinned), rotating refresh cookie + family revocation (10 s racing-tab grace), Origin guard, rate limits, demo user seed. 202 unit + 32 integration tests                                                          |
| Next up            | 🔄 Frontend: clickable demo (in progress). Web needs cross-tab refresh lock (Web Locks) per database-design §14. Backend: Phase 3 catalog (awaiting go-ahead)                                                                                                                     |

## 3. Source of truth

| Topic                                                | File                                                    | Rendered (dev only) |
| ---------------------------------------------------- | ------------------------------------------------------- | ------------------- |
| Plan, phase checklists, decisions log                | `plan.md`                                               | –                   |
| Database schema                                      | `docs/er-diagram.mmd` → `apps/api/prisma/schema.prisma` | `/er-diagram`       |
| DB rules: seat locks, booking lifecycle, constraints | `docs/database-design.md`                               | `/er-diagram`       |
| API contract (endpoints, schemas, `ErrorCode`)       | `docs/openapi.yaml`                                     | `/openapi`          |
| Security controls (WEB-\*, API-\*, DB-\*, OPS-\*)    | `docs/security.md`                                      | –                   |
| Design tokens                                        | `apps/web/src/app/globals.css`                          | `/design-system`    |

**Contract first:** if code and docs disagree, the docs are right, unless you can show they're wrong. Then report
it (see §5). Don't silently diverge.

## 4. Repo map

```
apps/web        Next.js 16 (App Router, output: "export" → static files for S3 + CloudFront)
  src/app            routes (thin). Dev review pages: er-diagram, openapi, design-system
  src/components/ui  shadcn/ui (vendored, Radix). Relaxed lint
  src/components/cinema  seat, seat map, screen, rating badge, showtime chip, countdown, banner, cards
  src/lib            pure helpers (format, seat rules, diagram) + their *.test.ts
apps/api        NestJS 12 (ESM, nodenext, Vitest)
  prisma/            schema.prisma, migrations/ (init + hand-written db_constraints), verify-constraints.sql
  prisma.config.ts   Prisma 7 config (CLI connects as migrator)
  src/generated/     Prisma client output (git-ignored, run db:generate)
packages/tsconfig      shared tsconfig bases (base, nestjs, nextjs)
packages/eslint-config shared flat configs (base, nest, next): strict, type-aware
docs/           design docs (see §3)
docker/         Postgres init script (roles and databases)
```

## 5. Multi-agent workflow

**Roles**

- **Lead / reviewer** (the main Claude session): plans items, writes the briefs, reviews, merges into `main`, owns
  `docs/`, `plan.md` and this file, and talks to the product owner.
- **Frontend agent:** `apps/web/**` only.
- **Backend agent:** `apps/api/**`, `docker/**`, `docker-compose.yml`, `.env.example` files.

**Rules**

1. **One plan item at a time.** Do exactly the brief, commit once, report, then **stop**. Don't start the next item.
2. **Work in your own git worktree.** Before starting an item, run `git merge main` and `npm ci`.
3. **File ownership is strict.** Shared files (root `package.json`, `package-lock.json`, `turbo.json`, `.gitignore`,
   `.github/**`) may be changed only when the brief says so, and you must list them in your report. `docs/`, `plan.md`
   and `AGENTS.md` belong to the lead.
4. **Found a doc mismatch or a better idea?** Note it in the report under "Deviations", don't edit docs. The lead decides.
5. **Product decisions** (business rules, UX, scope) belong to the product owner. Raise them, don't decide them.
6. **Never** use `--no-verify`, never force-push, never commit secrets. Leave shared running services
   (Postgres container) running.

**Definition of done for an item**

- [ ] Matches the brief and the source-of-truth docs
- [ ] **Unit tests ship with the code** (web: Vitest + Testing Library, api: Vitest). No placeholder tests
- [ ] `npm run check` passes from the repo root
- [ ] For DB or API work, the relevant DB/integration checks were run (`npm run db:verify`, `npm run test:int -w api`)
- [ ] For UI work, it was looked at in a browser, including at 375px wide
- [ ] One Conventional Commit, ending with the co-author trailer the session tells you to use

**Report template** (keep it short)

```
Branch + commit hash
What changed (files / modules)
Public APIs (component props, endpoints, scripts)
Tests added (count) + check results
Deviations from the brief and why
Shared files touched
Things the reviewer should look at closely
```

## 6. Commands

```bash
npm ci                       # install (Node 24, see .nvmrc)
npm run check                # format + spec lint + lint + typecheck + test + build (all workspaces)
npm run dev:web              # web on :3000 (agents: npm run dev -w web -- -p 3100)
npm run db:up                # start Postgres (127.0.0.1:5433) and wait until healthy
npm run db:migrate           # prisma migrate dev (as migrator)
npm run db:verify            # run the 26 constraint and privilege checks (rolled back)
npm run db:generate -w api   # generate the Prisma client
npm run lint:openapi         # lint docs/openapi.yaml
npm run test -w web          # web unit tests
```

Ports: web 3000 (lead preview) / 3100 (agents), api 4000, Postgres 5433.

## 7. Engineering rules (short version: details in plan.md §5 and docs/security.md)

**Everywhere:** strict TypeScript, type-aware ESLint, no `any`, no unhandled promises, Prettier (100 cols).
Conventional Commits (`feat|fix|build|docs|chore|test|refactor(scope): …`; `merge:` is not a valid type, use `chore:`).

**Frontend**

- Static export: no SSR, no Server Actions, no middleware, no `cookies()`. Data is fetched in the browser.
- **Server state lives only in TanStack Query. Zustand holds the session only. The URL holds filters, date and
  `?seats=`.** Forms use React Hook Form + `zodResolver`.
- **Semantic design tokens only.** No raw Tailwind palette colors (`red-500`) and no hex codes in components.
- Thai is the default. All user-facing copy goes through next-intl. Errors show `t("errors.<CODE>")`, never the
  API's English message.
- Accessibility: real buttons, aria labels, keyboard support, visible focus, `prefers-reduced-motion` respected.

**Backend**

- **Authorization in every query** (`WHERE user_id = currentUser`). Another user's resource → 404 (API-1).
- **The server computes prices, totals, statuses and deadlines.** Clients only send ids (API-3).
- Strict Zod DTOs (unknown keys rejected). Every error uses the `Error` schema and `ErrorCode` from the contract.
- **Money = whole baht integers** (`*_baht`). Only the Stripe adapter converts (`baht × 100`).
- **Time** is stored as `timestamptz` (UTC). Bangkok-day logic lives only in `bangkokDayRange()`.
- State changes use guarded updates (`WHERE status = 'PENDING_PAYMENT'`), write `booking_events` in the same
  transaction, and jobs take an advisory lock.
- The app connects as `app_user` (DML only). Migrations run as `migrator`. Anything Prisma can't express (partial
  indexes, CHECKs, exclusion constraints) goes in hand-written SQL migrations.

## 8. Gotchas we've already hit

- **Next.js 16 is newer than most training data.** Read `node_modules/next/dist/docs/` before using a Next API
  (`apps/web/AGENTS.md`). Cache Components and partial prerendering are **off**, because they're incompatible with
  `output: "export"`.
- `tsc` needs Next's generated types: the web `typecheck` script runs `next typegen` first.
- The Prisma client is generated and git-ignored. Run `npm run db:generate -w api` after `npm ci`.
- Prisma 7: `prisma.config.ts`, the `prisma-client` generator with ESM output, `@prisma/adapter-pg`. Pinned to stable
  7.x on purpose (8.x was only an RC).
- API is ESM: relative imports need the `.js` extension. Nest DI needs value (not type-only) imports for injected classes.
- Docker Compose has a fixed project name (`movie-ticketing`), so containers are shared across worktrees. Don't
  `docker compose down -v` unless the lead asks.
- `.turbo/`, `.claude/worktrees/` and `apps/api/src/generated/` are git- and Prettier-ignored. Never commit them.
- `gitleaks` may not be installed locally. The pre-commit hook skips it with a warning, and CI still scans.
- **nestjs-zod 5.5** declares a NestJS 10–11 peer but works on NestJS 12. If `npm install -w api …` fails with
  ERESOLVE on it, re-run that one command with `--legacy-peer-deps`. Do **not** add a global `.npmrc`
  (`legacy-peer-deps=true` would hide real conflicts). Drop this once upstream supports NestJS 12.
- Vitest in the API uses **SWC** (`unplugin-swc`) because Nest DI needs decorator metadata, which esbuild doesn't emit.
- `prisma generate` works without a database or `.env`. Migrate commands need `MIGRATION_DATABASE_URL`.
  Turbo runs `db:generate` before api `lint`/`typecheck`/`test`/`build`.
- Validation errors: `details.fields` is `{ "<field.path>": ["<zod issue code>"] }`, `_root` for whole-body errors,
  `unrecognized_key` for unknown keys. The web maps it straight onto React Hook Form's `setError`.
- `movies.poster_url` is **nullable**: no poster → the web's own placeholder. Never use third-party placeholder
  image hosts (CSP allows only self + `image.tmdb.org`).
- **Merging two branches that both touched `package-lock.json`**: never hand-merge it. `git checkout --ours
package-lock.json && npm install` (rebuilds from the merged package.json files), then `npm run check`.
- Peer deps must be declared explicitly (e.g. `@testing-library/dom` for Testing Library React). A rebuilt lockfile
  won't keep an undeclared peer.
- After reinstalling packages while `next dev` runs, Turbopack's cache can keep stale paths ("Cannot find module
  …/dist/index.js"). Stop the server, `rm -rf apps/web/.next`, start again.
- Web routes live under `src/app/[locale]/`. Dev pages are `page.dev.tsx` in `src/app/(dev)/` and only exist when
  `INCLUDE_DEV_PAGES=1` (set by `npm run dev`). `scripts/finalize-build.mjs` fails the build if dev pages or the MSW
  worker reach `out/`.
- The embedded browser pane may block service workers, so the MSW worker isn't guaranteed there (an in-process mock
  fallback is planned in the demo item).
- shadcn's CLI asks for a preset interactively. Pass `-p nova -b radix` and close stdin.
