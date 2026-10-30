# Movie Ticketing — Plan

A full-stack movie ticketing app (Next.js + NestJS), built production-grade to learn backend, AWS, DevOps and
AI-assisted development.

## 1. MVP

A customer can, in **Thai (default) or English**: browse movies → pick a showtime → pick 1–4 seats (as a guest) →
log in → pay within 5 min by **card (Mastercard/Visa)** or **PromptPay QR** (Stripe test mode, THB) → get a **ticket QR**
→ see "My bookings". There is no admin UI. Data comes from a seed script.

**Done when:** the full stack runs with `docker compose up`, a ticket can be bought end to end, CI is green, and unit,
integration and e2e tests pass. AWS comes after the MVP.

**Testing rule:** every phase ships its **unit tests** with the code (web: Vitest + Testing Library, api: Vitest).
A phase isn't done until its unit tests pass in CI. Integration and e2e suites come in Phase 7.

## 2. Design docs (source of truth)

| What                                           | File                                         | Review at     |
| ---------------------------------------------- | -------------------------------------------- | ------------- |
| Database: ER diagram                           | `docs/er-diagram.mmd`                        | `/er-diagram` |
| Database: rules, locks, lifecycle, constraints | `docs/database-design.md`                    | `/er-diagram` |
| API contract                                   | `docs/openapi.yaml` (`npm run lint:openapi`) | `/openapi`    |
| Security controls (WEB-_, API-_, DB-_, OPS-_)  | `docs/security.md`                           | –             |

## 3. Stack

| Area          | Choice                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Repo          | npm workspaces + **Turborepo** (cached builds). Node 24 (`.nvmrc`), TypeScript strict everywhere                           |
| Quality       | ESLint (typed rules), Prettier, Husky + lint-staged, commitlint (Conventional Commits), gitleaks                           |
| Web           | Next.js 16 static export, Tailwind v4, shadcn/ui, next-intl (`/th`, `/en`), `/design-system` as the component catalog (S9) |
| Web state     | TanStack Query (server state), Zustand (session only), React Hook Form + Zod (forms), URL (filters, date, `?seats=`)       |
| API client    | orval → typed fetchers, Query hooks, Zod schemas and **MSW mocks** from OpenAPI                                            |
| API           | NestJS 12 (ESM), **nestjs-zod** (Zod DTOs → OpenAPI), Prisma, PostgreSQL 17, pino, helmet, throttler, `@nestjs/schedule`   |
| Auth          | Email + password first, **LINE Login (OAuth 2.0)** later. JWT 15 min + rotating refresh cookie with family revocation      |
| Payments      | Stripe PaymentIntents + Payment Element (`card`, `promptpay`), webhooks                                                    |
| Observability | Request ids end to end, pino JSON logs, Sentry (web + api)                                                                 |
| Tests         | **Vitest everywhere** (web + api unit), **Testcontainers** Postgres (api integration), Playwright (e2e)                    |
| Run           | Docker Compose: postgres, api, web (nginx + `/api` forwarding + security headers), stripe-cli                              |
| CI            | GitHub Actions from Phase 1: lint, typecheck, spec lint, tests, build, audit, gitleaks                                     |
| Later         | AWS (S3 + CloudFront, ALB + ECS Fargate, RDS), Terraform, GitHub OIDC deploys                                              |

## 4. Work checklist

Each phase lists **DB**, **API** and **WEB** work. Security ids refer to `docs/security.md`.

**Legend:** `[x]` done and verified · `[ ]` to do · `🧪` **built on mock data** (the clickable demo): the screen
exists and is tested against the contract-faithful mock API. It's ticked only once it runs against the real API.

### Phase 0: Design ✅

- [x] Monorepo + Next.js scaffold (static export)
- [x] ER diagram, database design, booking lifecycle (`/er-diagram`)
- [x] OpenAPI contract (`/openapi`), security doc
- [x] Grilling rounds 1–3 (decisions log §7)

### Phase 1: Foundation

**Repo / DevOps**

- [x] Turborepo pipeline (`build`, `lint`, `typecheck`, `test`), `.nvmrc`, `.editorconfig`
- [x] Shared configs: `packages/tsconfig`, `packages/eslint-config` (typed rules, import order, no floating promises)
- [x] Prettier, Husky + lint-staged, commitlint, gitleaks pre-commit (OPS-3)
- [x] GitHub Actions CI: lint, typecheck, `lint:openapi`, build, `npm audit`, gitleaks (OPS-1, OPS-4). Dependabot _(written, never run: repo not on GitHub yet)_
- [x] `docker-compose.yml` (dev): postgres 17 with `app_user` + `migrator` roles (DB-2)

**DB**

- [x] Prisma schema per ER diagram (all enums, relations, `@@map` to snake_case)
- [x] Raw SQL migrations: partial uniques (seat lock, one pending booking, email), CHECK constraints, showtime exclusion (`btree_gist`), indexes (DB-1)
- [x] Grants: `app_user` DML only (DB-2), in the `app_user_grants` migration so resets keep them
- [x] `seed` (2 cinemas × 3 halls with seat layouts, showtimes today → +30 days, prices). Deterministic and idempotent. Uses `movies.sample.json` until `movies.json` exists
- [x] Real movies: 18 TMDB movies in `movies.json` (TH/EN, posters, backdrops), DB seeded. Refresh any time with `npm run seed:fetch-movies -w api` (+ dev DB reset to replace the set)

**API**

- [x] NestJS app with modules: `config`, `prisma`, `health`, `common` (filters, interceptors, decorators)
- [x] Config: Zod-validated env, refuses weak secrets (API-13)
- [x] pino logs + request id (`X-Request-Id`) + redaction (API-8)
- [x] Global error filter → `Error` schema, Prisma error mapping, `ErrorCode` enum shared with the contract (API-7)
- [x] `nestjs-zod` validation pipe (strict) + Swagger at `/api/docs` (API-2)
- [x] helmet, CORS (dev only), body limits, `trust proxy` (API-9, API-14)
- [x] `getLiveness`, `getReadiness`, graceful shutdown (API-15)
- [x] `booking.config.ts` (MAX_SEATS 4, PAYMENT_WINDOW 5 min, SEAT_HOLD 6 min, CUTOFF +30 min), `bangkokDayRange()`
- [x] Vitest + Testcontainers harness ready (unit tests ship with each item; integration suites grow per phase)

**WEB**

- [x] next-intl: `app/[locale]`, `messages/th.json` + `en.json` (incl. all `errors.*` codes), `/` → `/th`
- [x] shadcn/ui init, theme tokens (light/dark), fonts with Thai support. Design system approved (S7)
- [x] Providers: QueryClient (no retry on 4xx, sensible staleTime), Toaster
- [x] `lib/api-client.ts` (base URL, bearer, request id, 401 → single-flight refresh → retry), orval config (`npm run api:generate`) generating client, hooks, Zod and MSW mocks
- [x] MSW in development so pages can be built before endpoints exist
- [x] App shell: header, language switcher, footer (TMDB attribution), error boundary, not-found, loading skeletons
- [x] Dev pages excluded from production build (WEB-1)
- [x] ~~Storybook~~ dropped (S9): `/design-system` is the live component catalog

### Phase 2: Auth (email + password)

**DB**

- [x] `users`, `refresh_tokens` (family), `auth_identities` in use
      **API**
- [x] `register`, `login`, `refresh`, `logout`, `getMe` (API-4)
- [x] argon2id, dummy hash for unknown emails (equal timing)
- [x] Refresh rotation + family revocation in a transaction (`SELECT … FOR UPDATE`)
- [x] `JwtAuthGuard`, `@CurrentUser()`, `@Public()` (global guard, routes opt out)
- [x] Origin check on cookie endpoints (API-5), rate limits (API-6)
      **WEB**
- [x] `useAuthStore` (memory), session restore on load, single-flight refresh (WEB-4) + cross-tab Web Locks
- [x] `/login?next=`, `/register?next=` (RHF + Zod from orval, server errors mapped to fields), safe `next` (WEB-5)
- [x] Header user menu, logout, `RequireAuth` + `GuestOnly` wrappers. Verified against the real API (`npm run dev:api -w web`)

### Phase 3: Catalog

**API**

- [x] `listGenres`, `listCinemas`, `listMovies` (filters, search across TH/EN, pagination), `getMovie`, `listMovieShowtimes` (Bangkok-day grouping, `availableDates`, `seatsLeft`)
- [x] `Cache-Control` for public catalog responses (60 s; showtimes 15 s because `seatsLeft` changes), errors/authed `no-store`
- [x] **Contract test:** NestJS-generated OpenAPI vs `docs/openapi.yaml` (paths, methods, schemas) fails CI on drift (code review #1)
- [x] **CI integration job:** `npm run test:int -w api` on GitHub Actions (Docker available on runners) (code review #2). Written + actionlint-clean; first run when the repo is on GitHub
      **WEB**
- [x] Home (now showing / coming soon), `/movies` (genre + search in URL), `/movie?slug=` (date picker, showtimes by cinema)
- [x] Switch catalog screens from mocks to the real API (`NEXT_PUBLIC_API_MOCKING` off for these routes), so the 🧪 items above become [x]
- [x] ฿ formatting, poster images with sizes and placeholders, localized day/month labels
- [ ] Thai Buddhist-calendar years on `/th` wherever a year is shown (tickets, Phase 6)

### Phase 4: Seats and booking

**DB**

- [x] `booking_events`, `idempotency_keys` in use
      **API**
- [x] `getShowtime`, `getSeatMap` (status at request time, `no-store`)
- [x] `createBooking`: Idempotency-Key, one transaction, stale-hold cleanup, server-side pricing, events (API-3, API-11)
- [x] `getActiveBooking`, `getBooking`, `listMyBookings`, `cancelBooking`, all scoped by user (API-1)
- [x] Expiry job every 30 s with an advisory lock: cancel PaymentIntent → `PAYMENT_TIMEOUT` + unlock. Also cleans idempotency keys
      **WEB**
- [x] Seat map component (every state on `/design-system`), keyboard navigation + aria labels, mobile pinch/zoom
- [x] `/showtime?id=&seats=`: 10 s polling while visible, "seat just taken" UX (§6), price summary
- [x] Buy → login if needed → `createBooking` (Idempotency-Key per click) → `/checkout`
- [x] Active-booking banner, blocked back navigation (§6)
- [x] **Optimistic seat map:** Buy previews your seats as held (polling paused, cache primed for checkout), cancel releases them instantly. Rollback on `SEAT_TAKEN` / errors. The DB stays the source of truth. On rollback: apology toast ("ขออภัย ที่นั่ง A5 มีผู้จองไปแล้ว"), and the taken seats show as occupied immediately

Phase 5 notes (2026-10-30): `PAYMENTS_PROVIDER=stripe|fake`. The fake provider runs the same webhook handler from `POST /__demo/pay`. The PaymentIntent cancel for stale holds now runs after the createBooking transaction commits. A payment row is created with method CARD and the webhook records the real method (the Payment Element lets the customer choose).

Phase 4 notes: seat locks are taken in sorted seat order (no deadlocks between overlapping requests, `2c5d7af`). Phase 5 must move the PaymentGateway call out of the createBooking transaction (a network call under row locks). Movie status is not checked when booking (open product question).

### Phase 5: Payment

**API**

- [x] `createPaymentIntent` (idempotent, Stripe idempotency key, `toStripeAmount`) (API-10)
- [x] `stripeWebhook`: raw body, signature, `stripe_events`, amount check, guarded confirm, late payment → refund, events
      **WEB**
- [x] `/checkout?bookingId=`: Payment Element (Card + PromptPay QR), 5:00 countdown synced to server time, "Time's up" dialog (WEB-8)
- [x] `/checkout/complete`: polls `getBooking` until CONFIRMED / CANCELLED, handles the late-refund case
- [x] ~~Replace `DemoPaymentPanel` in production~~ changed (D10): the checkout shows the Stripe panel for a `pk_` key and the demo panel when the API runs `PAYMENTS_PROVIDER=fake`, so the demo panel still ships; `/__demo/pay` answers 404 unless the API runs the fake provider
- [ ] Verify with real Stripe test keys + Stripe CLI (no keys yet; the webhook path is covered by signed-event tests): test Mastercard `5555 5555 5555 4444`, decline cards, PromptPay authorize / fail

### Phase 6: Tickets

**API**

- [x] Signed `ticketQr` (HMAC, own secret) (API-12). Constant-time verify comes with the door scanner
      **WEB**
- [x] `/bookings` (upcoming / past tabs), `/booking?id=` ticket with QR, add-to-calendar (`.ics`), on the real API

### Phase 7: Tests

- [ ] **Unit coverage review:** fill gaps left by earlier phases (unit tests themselves are written in every phase)
- [ ] **Integration (Testcontainers):** concurrent same-seat booking → one wins, one active booking, idempotent replay, payment timeout, late refund, webhook signature + duplicates, refresh reuse → family revoked, **IDOR on every user endpoint**
- [x] **e2e (Playwright, both locales, desktop + mobile)**, `e2e/`, CI job on the real images. Done: guest → login, card → ticket → my bookings, PromptPay, cancel releases seats. Still to add: guest browse → seats → login → test Mastercard → ticket; PromptPay; seat taken; time's up; back-navigation block
- [ ] Every row in the business-rules table and every security control has a test. Tests run in CI

### Phase 8: Full stack on Docker Compose = MVP done

- [x] Dockerfiles: api (multi-stage, non-root, pinned base), web (build → nginx with CSP and security headers, `/api` forwarding) (OPS-2, WEB-2, WEB-3)
- [x] Compose (`stack` profile): postgres, migrate (one-off, as `migrator`), api, web, stripe-cli
- [ ] Sentry wired (web + api) with request ids
- [x] README: one-command setup, env reference, test cards, architecture diagram

### After the MVP

- [ ] **LINE Login** (`startLineLogin`, `lineLoginCallback`), then Google
- [ ] Email (AWS SES): verification, password reset, e-ticket email
- [x] Contract check in CI: NestJS-generated spec vs `docs/openapi.yaml` (done in Phase 3, plus runtime conformance)
- [ ] AWS: manual first (VPC, RDS, ECR, ECS Fargate, ALB, S3 + CloudFront + OAC, Route 53, ACM, WAF, budget alarm), then Terraform + GitHub OIDC deploys (OPS-5, DB-7)
- [ ] OpenTelemetry tracing, CloudWatch dashboards and alarms
- [ ] Account deletion (PDPA), active-sessions page
- [ ] Admin UI, couple seats, real-time seats (WebSocket), Redis, door check-in scanner

## 5. Frontend rules

- **Server data lives only in TanStack Query.** Never copy it into Zustand. Query keys come from orval helpers. Mutations invalidate what they change.
- **Zustand = session only** (access token + user, memory, not persisted).
- **URL = shareable state**: filters, date, `?seats=` (survives the login redirect).
- **Forms = React Hook Form + `zodResolver`.** Schemas extend the orval-generated Zod.
- **Errors:** the UI shows `t(\`errors.${code}\`)`, never the API's English `message`.
- **Structure:** `app/[locale]/…` (thin routes) · `features/<auth|movies|showtimes|bookings|payments>/` · `api/generated/` (orval, never edited) · `lib/` · `components/ui/` (shadcn).

## 6. Key UX specs

**Seat just taken** (seen by polling, or via `409 SEAT_TAKEN` on Buy): the seat leaves the selection and `?seats=`,
flashes red for about 3 s, a toast says "Seat A5 was just taken" (one toast per refresh), the price summary updates, and
Buy is disabled if nothing is left. The rest of the selection is kept.

**One active booking:**

- A global banner on every page when `getActiveBooking` returns one: "Booking in progress · 3:12 [Continue payment] [Cancel]". It is checked on load and on window focus.
- Checkout blocks going back: back button or link → dialog "Going back will cancel this booking" → confirm → `cancelBooking` → seat map with the same `?seats=`.
- The seat map's Buy becomes "Continue your booking" while one is active. `409 ACTIVE_BOOKING_EXISTS` → go to that booking.

**Time's up** (countdown hits 0): dialog, payment disabled, button → seat map with the same `?seats=`.

**Checkout complete:** "Confirming payment…" while polling → ticket. If `CANCELLED (LATE_PAYMENT_REFUNDED)`:
"Payment arrived after the time limit and has been refunded."

## 7. Decisions log

| #     | Decision                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1    | Types: OpenAPI → orval (fetchers, Query hooks, Zod, MSW mocks)                                                                                                                          |
| D2    | Tokens: access in memory, refresh in httpOnly cookie                                                                                                                                    |
| D3    | Zustand: session only. Seat selection lives in the URL                                                                                                                                  |
| D4    | UI: shadcn/ui                                                                                                                                                                           |
| G1    | MVP done = Docker Compose locally + all tests. **Unit tests with each phase** (updated), integration + e2e in Phase 7                                                                   |
| G2    | Thai Stripe account: card + PromptPay                                                                                                                                                   |
| G3    | Guests browse and pick seats. Login only to buy                                                                                                                                         |
| G4    | Payment window 5 min, seat hold 6 min, locks only in the DB. Unpaid → `CANCELLED (PAYMENT_TIMEOUT)`. Late payment → auto refund                                                         |
| G5    | Max 4 seats. Booking open until start + 30 min. No refunds or cancellation after payment. Couple seats → backlog                                                                        |
| G6    | Seed from TMDB snapshot JSON. Posters as TMDB URLs. Showtimes today → +30 days                                                                                                          |
| G7    | Thai default + English: `*_th` / `*_en` columns, next-intl, `/th` `/en` routes                                                                                                          |
| G8    | Git, commit at checkpoints                                                                                                                                                              |
| R1    | Auth: email + password first, LINE Login later. Schema ready now (`auth_identities`)                                                                                                    |
| R2    | Seat map polls every 10 s, with "seat just taken" UX                                                                                                                                    |
| R3    | One active booking, blocked (not auto-cancelled), global banner, blocked back navigation                                                                                                |
| R4–R7 | Time's-up dialog · translated error codes · full Compose stack · test plan per Phase 7                                                                                                  |
| S1    | Backend validation with **nestjs-zod** (Zod everywhere)                                                                                                                                 |
| S2    | Refresh token families, Origin check, booking audit trail, idempotency keys, CHECK constraints, advisory-locked jobs, split DB roles                                                    |
| S3    | Production-grade tooling from Phase 1: Turborepo, strict lint, CI, gitleaks, MSW, Testcontainers, Sentry (Storybook later dropped, S9)                                                  |
| S4    | NestJS 12 scaffold kept. **Vitest** for the API too (one test runner repo-wide)                                                                                                         |
| S5    | Movie ratings use the **Thai system**: PROMOTED, GENERAL, AGE_13, AGE_15, AGE_18, AGE_20                                                                                                |
| S6    | Work split: one Sonnet subagent for frontend, one for backend, each in its own worktree. One plan item at a time, reviewed by the lead before merging into `main`                       |
| S7    | Design system "Marquee" **approved** (dark-first cinema theme, Prompt / Inter / IBM Plex Sans Thai, seat-state and Thai-rating tokens). Reference: `/design-system` (dev only)          |
| S8    | Occupied seats (BOOKED and HELD by others) show a **plain filled person icon** instead of ✕, colour still tells sold (grey) from being-paid (amber stripes). Product owner request      |
| D10   | Payments run on `stripe` or a `fake` provider (env). Fake keeps the demo pay flow so the app can be shown without a Stripe account; production must choose explicitly. Lead, 2026-10-30 |
| S9    | **Storybook dropped.** `/design-system` (dev-only page) already renders every token and cinema component state. Product owner, 2026-10-28                                               |
