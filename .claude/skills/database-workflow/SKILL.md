---
name: database-workflow
description: Use when changing the Prisma schema, writing a migration, touching roles/grants/constraints, changing the seed or movie data, or when the dev database looks wrong (permission denied, missing data, needs a reset). Postgres + Prisma 7 procedures and the consent rule for resets.
---

# Database workflow (Postgres 17 + Prisma 7)

Design rules live in `docs/database-design.md` and `docs/er-diagram.mmd` (the lead owns them; propose changes in your report).

## Roles

- `migrator` owns the schema and runs migrations (`MIGRATION_DATABASE_URL`).
- `app_user` is what the API uses (`DATABASE_URL`): DML only, no DDL, no `_prisma_migrations`.
- **Grants live in a migration** (`prisma/migrations/*_app_user_grants`), not only in `docker/postgres/init`: a reset drops the `public` schema with its grants. Any new role or privilege → a migration too, and a `db:verify` check.

## Changing the schema

1. Edit `apps/api/prisma/schema.prisma`. Anything Prisma can't express (partial unique indexes, CHECK, exclusion constraints, triggers) goes in a hand-written SQL migration (`--create-only`, then edit the SQL).
2. `npm run db:migrate` (prisma migrate dev, as migrator). Name migrations by intent (`booking_hold_index`, not `update`).
3. `npm run db:generate -w api`, then `npm run db:verify` (constraint + privilege checks, rolled back). Add a check there for every new invariant.
4. `npm run test:int -w api`: Testcontainers apply all migrations to a fresh DB, which catches ordering and grant mistakes.
5. Update `docs/er-diagram.mmd` + `docs/database-design.md` (lead) and mention it in the report.

Money is whole baht `integer`; time is `timestamptz`; Bangkok calendar days only via `bangkokDayRange()` / `bangkokDateOf()` (`apps/api/src/common/time/bangkok.ts`).

## Seed and movie data

- `npm run db:seed`: idempotent and **only adds** (never changes or deletes showtimes, which may have bookings).
- Movies come from TMDB into the committed `apps/api/prisma/seed/movies.json`: `npm run movies:fetch` (fetch + sync the web mock fixture + seed). Needs `TMDB_API_KEY` in the root `.env`; never print the key. Posters are `image.tmdb.org` URLs, never downloaded.
- Replacing the movie set needs a reset (below), because the seed only adds.

## Resetting the dev database (destructive)

`prisma migrate reset` deletes every row (users, bookings, everything) and refuses to run from an AI agent.

1. Subagents: never reset. Ask the lead in your report.
2. Lead: explain to the product owner what will be deleted and why, ask a structured question, and only on a clear yes run, for the local dev DB only:
   `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<their exact words>" npm run db:reset`
   then `npm run db:seed` and `npm run db:verify`.
3. Consent covers that one reset. Ask again next time.

## Troubleshooting

- `permission denied for schema public` after a reset → the grants migration didn't run or a new table lacks grants; `npm run db:migrate`, then `db:verify`.
- Prisma Studio: launch config `db-studio` (port 5555) or `npm run db:studio`.
- Port 5433 busy / container down: `npm run db:up` (waits until healthy). One container named `movie-ticketing` is shared by every worktree.
