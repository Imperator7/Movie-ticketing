# Security & Production Readiness

What we protect, from whom, and the control in each layer. Every control has a checklist item in `plan.md`.

## Assets and threats

| Asset                             | Threat                                             | Main controls                                                                                   |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Other users' bookings and tickets | IDOR (guessing or changing ids)                    | Ownership in every query (§API-1), 404 not 403, integration tests per endpoint                  |
| Money / ticket integrity          | Client tampering with prices, forged confirmations | Server-side pricing, webhook-only confirmation, amount check, signed ticket QR                  |
| Seats                             | Hoarding, double-booking, race conditions          | DB unique indexes, 1 active booking, 4-seat max, holds expire, rate limits                      |
| Accounts                          | Credential stuffing, stolen tokens, CSRF           | argon2id, rate limits, short JWT, refresh rotation + family revocation, SameSite + Origin check |
| Personal data (PDPA)              | Leaks through logs, errors, over-collection        | Log redaction, generic errors, minimal fields                                                   |
| Secrets                           | Leaking keys                                       | Env validation, Secrets Manager, never in git or logs, separate test and live keys              |
| Availability                      | Abuse, bad deploys                                 | Rate limits, readiness checks, graceful shutdown, alarms                                        |

## Frontend (web)

- **WEB-1 XSS:** React escaping only. No `dangerouslySetInnerHTML` in shipped pages (dev pages `/er-diagram` and `/openapi` are excluded from production builds).
- **WEB-2 Content Security Policy:** `default-src 'self'`. Scripts from self + `js.stripe.com`. Frames from `js.stripe.com`, `hooks.stripe.com`. Images from self + `image.tmdb.org` + `data:`. `connect-src 'self' api.stripe.com`. `frame-ancestors 'none'`. Set by nginx locally and by a CloudFront response headers policy in production.
- **WEB-3 Other headers:** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic and geolocation off).
- **WEB-4 Tokens:** access token in memory only, never in localStorage. The refresh token is an httpOnly cookie that JS can't read.
- **WEB-5 Redirects:** `?next=` only accepts relative paths starting with `/th/` or `/en/` (open-redirect protection).
- **WEB-6 Env:** only `NEXT_PUBLIC_*` values that are safe to be public (API base path, Stripe _publishable_ key).
- **WEB-7 Errors:** show translated messages for error codes. Never render raw server text. Error boundaries per route. Report errors to Sentry with the request id.
- **WEB-8 Payments:** card and PromptPay data only inside Stripe's Payment Element iframe (PCI SAQ A).

## Backend (API)

- **API-1 Authorization:** every query for user-owned data includes `userId` from the token. Another user's resource returns `404`. A reusable `@CurrentUser()` decorator plus scoped repository methods (`findBookingForUser(id, userId)`).
- **API-2 Validation:** `nestjs-zod` DTOs, strict objects (unknown keys rejected), limits on every string, array and number.
- **API-3 Server-side truth:** prices, totals, statuses and deadlines are computed on the server. The client sends only ids.
- **API-4 Auth:**
  - argon2id (memory 19 MiB, t=2).
  - The same `INVALID_CREDENTIALS` error and similar timing for an unknown email and a wrong password.
  - JWT: HS256 pinned, issuer and audience checked, 15 min, payload is `sub` and `sid` only.
  - Refresh: rotation, family revocation on reuse, hashed at rest.
- **API-5 CSRF:** refresh cookie `SameSite=Strict; Path=/api/v1/auth`, plus an `Origin` allow-list check on cookie endpoints.
- **API-6 Rate limits (`@nestjs/throttler`):**
  - Auth: 10/min per IP and 5/min per email.
  - `POST /bookings`: 10/min per user.
  - Global: 300/min per IP.
  - The real client IP is read through `trust proxy` (CloudFront → ALB).
- **API-7 Errors:** a global filter maps every error to the `Error` schema. Prisma errors are mapped (`P2002` → 409). No stack traces or SQL in responses.
- **API-8 Logging:** pino JSON with a request id, and redaction of `authorization`, `cookie`, `set-cookie`, `password`, `*.token`, `stripe-signature`, email and phone.
- **API-9 Headers:** helmet. CORS disabled in production (same origin). In development, only `http://localhost:3000`.
- **API-10 Stripe:**
  - Webhook signature checked on the raw body.
  - Event idempotency (`stripe_events`) and idempotency keys on Stripe API calls.
  - Amount and currency checked before confirming.
  - Restricted API key with only the permissions needed.
- **API-11 Idempotency:** `Idempotency-Key` on `POST /bookings`.
- **API-12 Ticket QR:** HMAC-SHA256 with a dedicated secret (not the JWT secret), comparison in constant time.
- **API-13 Config:** env validated with Zod at boot. The app refuses to start on a missing or weak secret (minimum 32 bytes).
- **API-14 Body limits:** JSON 100 kB. The webhook route takes the raw body, 1 MB.
- **API-15 Graceful shutdown:** on SIGTERM, readiness → 503, then drain, then close Prisma.

## Database

- **DB-1 Integrity:** foreign keys, unique and partial unique indexes, CHECK constraints, and an exclusion constraint (see `database-design.md` §2, §13, §17, §9).
- **DB-2 Least privilege:** the app connects as `app_user` (DML only). Migrations run as `migrator` (DDL). No superuser in the app.
- **DB-3 Secrets at rest:** password hashes (argon2id), refresh tokens (SHA-256). No raw tokens are ever stored.
- **DB-4 Transactions:** booking, confirmation and refresh rotation run in transactions with guarded updates and row locks where needed.
- **DB-5 Audit:** `booking_events` for every booking state change.
- **DB-6 Connections:** Prisma pool limit per container, sized against RDS `max_connections`.
- **DB-7 Backups (AWS):** RDS automated backups + point-in-time recovery, encryption at rest, and no public access (isolated subnets).
- **DB-8 Migrations:** forward-only, reviewed SQL, run as a separate step before deploy.

## Supply chain and DevOps

- **OPS-1** Lockfile committed. `npm ci` in CI. `npm audit --audit-level=high` in CI. Dependabot for npm, Docker and Actions.
- **OPS-2** Docker: pinned base images, multi-stage builds, non-root user, read-only root filesystem where possible, `.dockerignore`.
- **OPS-3** Secret scanning (gitleaks) in pre-commit and CI.
- **OPS-4** CI: lint, typecheck, `lint:openapi`, contract check, tests and build on every PR. `main` protected.
- **OPS-5** AWS: GitHub OIDC (no long-lived keys), least-privilege task roles, Secrets Manager, WAF managed rules on CloudFront, budget alarms.
