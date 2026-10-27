# Movie Ticketing — Plan

A full-stack movie ticketing app (Next.js + NestJS), built production-ready to learn AWS, DevOps and AI-assisted development.

## 1. MVP

A customer can, in **Thai (default) or English**: browse movies → pick a showtime → pick 1–4 seats (as a guest) →
log in → pay within 5 min by **card (Mastercard/Visa)** or **PromptPay QR** (Stripe test mode, THB) → get a **ticket QR**
→ see "My bookings". There is no admin UI. Data comes from a seed script.

**Done when:** the full stack runs with `docker compose up`, a ticket can be bought end to end, and unit, integration
and e2e tests pass. AWS comes after the MVP.

## 2. Design docs (source of truth)

| What | File | Review at |
|---|---|---|
| Database: ER diagram | `docs/er-diagram.mmd` | `/er-diagram` |
| Database: rules, seat locks, booking lifecycle | `docs/database-design.md` | `/er-diagram` (below the diagram) |
| API contract: every endpoint, schema and error code | `docs/openapi.yaml` (`npm run lint:openapi`) | `/openapi` |

## 3. Stack

| Area | Choice |
|---|---|
| Repo | npm workspaces: `apps/web`, `apps/api` |
| Web | Next.js 16 static export, Tailwind v4, shadcn/ui, next-intl (`/th`, `/en`) |
| Web state | TanStack Query (server state), Zustand (session only), React Hook Form + Zod (forms), URL (filters, date, `?seats=`) |
| API client | orval → typed fetchers, Query hooks and Zod schemas from OpenAPI |
| API | NestJS, Prisma, PostgreSQL, Swagger, pino |
| Auth | Email + password first, **LINE Login (OAuth 2.0)** later. JWT 15 min + rotating httpOnly refresh cookie (7 days) |
| Payments | Stripe PaymentIntents + Payment Element (`card`, `promptpay`), webhooks |
| Tests | Jest (api unit + integration), Vitest + Testing Library (web), Playwright (e2e) |
| Run | Docker Compose: postgres, api, web (nginx + `/api` forwarding), stripe-cli |
| Later | GitHub Actions, AWS (S3 + CloudFront, ALB + ECS Fargate, RDS), Terraform |

## 4. Work checklist

### Phase 0: Design ✅
- [x] Monorepo + Next.js scaffold (static export)
- [x] ER diagram, database design, booking lifecycle (`/er-diagram`)
- [x] OpenAPI contract (`/openapi`)
- [x] Grilling rounds 1–3 (decisions log §7)

### Phase 1: Foundation
- [ ] `apps/api` NestJS: config with env validation, pino logs + request id, global error filter → `Error` schema, Swagger at `/api/docs`
- [ ] `docker-compose.yml` with postgres (dev). `.env.example` files
- [ ] Prisma schema per ER diagram + raw SQL migrations: seat-lock partial unique, one-pending-booking partial unique, email partial unique, showtime no-overlap (`btree_gist`)
- [ ] `booking.config.ts` (MAX_SEATS 4, PAYMENT_WINDOW 5 min, SEAT_HOLD 6 min, CUTOFF +30 min)
- [ ] `seed:fetch-movies` (TMDB → `movies.json`, committed) and `seed` (2 cinemas × 3 halls, showtimes today → +30 days)
- [ ] `getHealth`
- [ ] Web: next-intl (`/th` default, `/en`, `messages/*.json`, `/` → `/th`), shadcn/ui, QueryClientProvider, `api-client.ts`, orval config + `npm run api:generate`
- [ ] Web: app shell (header, language switcher, footer with TMDB attribution, error and loading states)

### Phase 2: Auth (email + password)
- [ ] API: `register`, `login`, `refresh` (rotation), `logout`, `getMe`, argon2id, rate limit on `/auth/*`
- [ ] Web: `useAuthStore` (memory), session restore on load, 401 → refresh → retry (single flight)
- [ ] Web: `/login?next=`, `/register?next=` (RHF + Zod, server errors mapped to fields)

### Phase 3: Catalog
- [ ] API: `listGenres`, `listCinemas`, `listMovies`, `getMovie`, `listMovieShowtimes`
- [ ] Web: home, `/movies` (genre + search in URL), `/movie?slug=` (date picker from `availableDates`)

### Phase 4: Seats and booking
- [ ] API: `getShowtime`, `getSeatMap` (status computed at request time, `no-store`)
- [ ] API: `createBooking` (one transaction, error codes per the contract), `getActiveBooking`, `getBooking`, `cancelBooking`, `listMyBookings`
- [ ] API: expiry job every 30 s (cancel PaymentIntent → `PAYMENT_TIMEOUT` + unlock; refused → wait until the hold ends)
- [ ] Web: `/showtime?id=&seats=` seat map, polling every 10 s, "seat just taken" UX (§6)
- [ ] Web: "Buy" → login if needed → `createBooking` → `/checkout`
- [ ] Web: active-booking banner + blocked paths (§6)

### Phase 5: Payment
- [ ] API: `createPaymentIntent` (idempotent, `toStripeAmount = baht × 100`), `stripeWebhook` (raw body, signature, `stripe_events` idempotency, late payment → auto refund)
- [ ] Web: `/checkout?bookingId=` Payment Element (Card + PromptPay QR), 5:00 countdown, "Time's up" dialog (§6)
- [ ] Web: `/checkout/complete` polls `getBooking` until CONFIRMED / CANCELLED
- [ ] Verify with Stripe CLI: test Mastercard `5555 5555 5555 4444`, PromptPay test authorize / fail

### Phase 6: Tickets
- [ ] API: signed `ticketQr` (`bookingCode.hmac`) on CONFIRMED bookings
- [ ] Web: `/bookings` (upcoming / past), `/booking?id=` ticket with QR

### Phase 7: Tests
- [ ] Unit: booking rules, pricing, `toStripeAmount`, QR signing, auth token rotation
- [ ] Integration (real test Postgres): concurrent same-seat booking → one wins, one-active-booking, payment timeout, late payment refund, webhook signature + duplicates
- [ ] e2e (Playwright): guest browse → seats → login → pay with test Mastercard → ticket; PromptPay via Stripe's test authorize page; seat-taken UX
- [ ] Rule: every row in the business-rules table (`docs/database-design.md`) has a test. No coverage % target

### Phase 8: Full stack on Docker Compose = MVP done
- [ ] Dockerfiles: api (multi-stage), web (build → nginx serving `out/`, `/api` forwarded to the api, like CloudFront)
- [ ] Compose: postgres, api (runs migrations on start), web, stripe-cli (forwards webhooks)
- [ ] README: one-command setup, test card numbers

### After the MVP
- [ ] **LINE Login** (`startLineLogin`, `lineLoginCallback`, already in the contract and schema). Then Google
- [ ] Email verification, password reset (needs email: AWS SES)
- [ ] CI (GitHub Actions): lint, typecheck, `lint:openapi`, tests, build. Contract check: NestJS spec matches `docs/openapi.yaml`
- [ ] AWS: manual first (VPC, RDS, ECR, ECS Fargate, ALB, S3 + CloudFront + OAC, Route 53, ACM, budget alarm), then Terraform + deploys through GitHub OIDC
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
- A global banner on every page when `getActiveBooking` returns one: "Booking in progress · 3:12 [Continue payment] [Cancel]". It is checked on load and on window focus, so it greets users who closed the app and came back.
- Checkout blocks going back: the back button or link → dialog "Going back will cancel this booking" → confirm → `cancelBooking` → seat map with the same `?seats=`.
- The seat map's Buy is replaced with "Continue your booking" while one is active. `409 ACTIVE_BOOKING_EXISTS` → go to that booking.

**Time's up** (countdown hits 0): dialog, payment disabled, button → seat map with the same `?seats=`.

**Checkout complete:** spinner "Confirming payment…" while polling → ticket. If `CANCELLED (LATE_PAYMENT_REFUNDED)`:
"Payment arrived after the time limit and has been refunded."

## 7. Decisions log

| # | Decision |
|---|---|
| D1 | Types: OpenAPI → orval (fetchers, Query hooks, Zod) |
| D2 | Tokens: access in memory, refresh in httpOnly cookie |
| D3 | Zustand: session only. Seat selection lives in the URL |
| D4 | UI: shadcn/ui |
| G1 | MVP done = Docker Compose locally + all tests. Tests written after features |
| G2 | Thai Stripe account: card + PromptPay |
| G3 | Guests browse and pick seats. Login only to buy |
| G4 | Payment window 5 min, seat hold 6 min, locks only in the DB. Unpaid → `CANCELLED (PAYMENT_TIMEOUT)`. Late payment → auto refund |
| G5 | Max 4 seats. Booking open until start + 30 min. No refunds or cancellation after payment. Couple seats → backlog |
| G6 | Seed from TMDB snapshot JSON. Posters as TMDB URLs (not downloaded). Showtimes today → +30 days |
| G7 | Thai default + English: `*_th` / `*_en` columns, next-intl, `/th` `/en` routes |
| G8 | Git, commit at checkpoints |
| R1 | Auth: email + password first, LINE Login (OAuth 2.0) later. Schema ready now (`auth_identities`) |
| R2 | Seat map polls every 10 s, with "seat just taken" UX |
| R3 | One active booking, **blocked** (not auto-cancelled), global banner, blocked back navigation |
| R4–R7 | Time's-up dialog · translated error codes · full Compose stack with nginx + stripe-cli · test plan per Phase 7 |
