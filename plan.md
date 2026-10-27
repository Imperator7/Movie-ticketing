# Movie Ticketing — Project Plan

A full-stack movie ticketing app built to be production-ready. It is also a way to learn AWS, DevOps,
and AI-assisted development.

**Current focus: MVP (customer side only).** Admin tools, real-time seats and similar features come later (§9).

---

## 1. MVP Scope

A customer can:

1. Sign up / log in
2. Browse movies (now showing, coming soon) and filter by genre
3. Open a movie and see showtimes by date and cinema
4. Pick seats on a seat map
5. Pay with **card (Mastercard / Visa)** or **PromptPay QR** through Stripe (test mode, THB)
6. Get a confirmed booking with a **ticket QR code**
7. See "My bookings"

**MVP is done when:** the whole stack runs with `docker compose up` locally, a ticket can be bought end to end with
Stripe test mode (Stripe CLI forwards webhooks), and unit, integration and e2e test suites pass.
Tests are written in a dedicated phase **after** features (see §8). AWS is a separate milestone after the MVP.

There is no admin UI in the MVP. Movies, cinemas, halls, seats and showtimes come from a **seed script**.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces (`apps/web`, `apps/api`, `packages/*`). Turborepo is optional later |
| Frontend | Next.js 16 (App Router) + TypeScript, **static export** (`output: "export"`) |
| Styling / UI | Tailwind CSS v4 + **shadcn/ui** |
| API client | **orval**: generates typed fetchers, TanStack Query hooks and Zod schemas from the NestJS OpenAPI spec |
| Server state | **TanStack Query** |
| Client state | **Zustand** |
| Forms | **React Hook Form + Zod** (`@hookform/resolvers/zod`) |
| Backend | NestJS + TypeScript |
| ORM / DB | Prisma + PostgreSQL |
| Auth | JWT access token + rotating refresh token (HTTP-only cookie) |
| Payments | Stripe **PaymentIntents + Payment Element** (`card`, `promptpay`), webhooks |
| API docs | Swagger (`@nestjs/swagger`) at `/api/docs` |
| Testing | Jest (api), Vitest + Testing Library (web), Playwright (e2e) |
| Local infra | Docker Compose (Postgres) |
| CI | GitHub Actions |

> **Stripe + PromptPay note:** PromptPay is only available to Stripe accounts registered in **Thailand**, with
> THB as the currency. Card payments work with any account. Test Mastercard: `5555 5555 5555 4444`.

---

## 3. Architecture

```
Browser ──► CloudFront ─┬─ /*      ──► S3 (Next.js static export)
                        └─ /api/*  ──► ALB ──► ECS Fargate (NestJS) ──► RDS Postgres
Stripe ──── webhook ───────────────────────► /api/v1/payments/webhook
```

- **Static export** means no SSR, Server Actions, middleware, or cookies on the Next.js side. All data
  is fetched in the browser from NestJS.
- **Dynamic pages use query params** (`/movie?slug=dune`, `/booking?id=...`), because static export can't
  generate `/movies/[slug]` for data that doesn't exist at build time.
- One domain for both parts means no CORS issues in production, and the refresh cookie can be `SameSite=Strict`.

---

## 4. MVP Checklist: Data Schema

Full design: [`docs/database-design.md`](docs/database-design.md). Diagram: `/er-diagram`.

- [x] ER diagram drafted (`docs/er-diagram.mmd`)
- [ ] **Review the ER diagram and answer its open questions** ← *you are here*
- [ ] Prisma schema (`apps/api/prisma/schema.prisma`) matching the diagram
- [ ] Enums: rating, movie status, hall type, seat type, showtime format/status, booking status, payment method/status
- [ ] Raw SQL migration: partial unique index `booking_seats (showtime_id, seat_id) WHERE released_at IS NULL`
- [ ] Raw SQL migration: showtime overlap exclusion constraint (`btree_gist`)
- [ ] Secondary indexes (see design doc)
- [ ] Seed script: ~10 movies, genres, 2 cinemas, 3 halls each with seat layouts, 7 days of showtimes and prices
- [ ] Test: two concurrent bookings for the same seat → exactly one succeeds

---

## 5. MVP Checklist: API Endpoints (`/api/v1`)

### Health
- [ ] `GET /health` — DB ping, used by the ALB

### Auth
- [ ] `POST /auth/register` — email, password, fullName → user + access token, sets refresh cookie
- [ ] `POST /auth/login` → access token + refresh cookie
- [ ] `POST /auth/refresh` — reads the cookie, rotates the token → new access token
- [ ] `POST /auth/logout` — revokes the refresh token, clears the cookie
- [ ] `GET /auth/me` — current user

### Catalog (public)
- [ ] `GET /genres`
- [ ] `GET /cinemas`
- [ ] `GET /movies?status=&genre=&q=&page=` — paginated list
- [ ] `GET /movies/:slug` — detail with genres
- [ ] `GET /movies/:slug/showtimes?date=&cinemaId=` — grouped by cinema → hall → times

### Showtimes and seats (public)
- [ ] `GET /showtimes/:id` — movie, hall, cinema, prices per seat type
- [ ] `GET /showtimes/:id/seats` — seat map with each seat's status: `AVAILABLE | HELD | BOOKED`

### Bookings (auth required)
- [ ] `POST /bookings` — `{ showtimeId, seatIds[] }` → `PENDING_PAYMENT` booking (10-minute hold), `409` if a seat was taken
- [ ] `GET /bookings/me` — my bookings (upcoming / past)
- [ ] `GET /bookings/:id` — detail. Includes `ticketQr` (signed payload) once `CONFIRMED`
- [ ] `POST /bookings/:id/cancel` — release the hold early (only while `PENDING_PAYMENT`)

### Payments
- [ ] `POST /bookings/:id/payment-intent` — creates or reuses a Stripe PaymentIntent → `{ clientSecret }` (auth)
  - Amounts are whole baht in the DB. Convert with `toStripeAmount(baht) = baht * 100` only here (Stripe wants satang)
- [ ] `POST /payments/webhook` — Stripe signature verified, raw body, idempotent through `stripe_events`
  - `payment_intent.succeeded` → payment `SUCCEEDED`, booking `CONFIRMED`
  - `payment_intent.payment_failed` → payment `FAILED` (the booking stays on hold until it expires)

### Background jobs
- [ ] Every minute: expire `PENDING_PAYMENT` bookings past `expires_at`, release their seats, cancel their PaymentIntents

### Cross-cutting
- [ ] Config module with env validation (fail fast)
- [ ] Global `ValidationPipe` / Zod pipe, consistent error format `{ statusCode, code, message, details? }`
- [ ] Swagger docs
- [ ] Structured logs (pino) with a request id
- [ ] Rate limiting on `/auth/*`
- [ ] Helmet, CORS (dev only), `enableShutdownHooks()`

---

## 6. MVP Checklist: Frontend Pages

| Route | Page | Auth |
|---|---|---|
| `/` | Home: now showing and coming soon | – |
| `/movies?genre=&q=` | Movie list with filters | – |
| `/movie?slug=` | Movie detail, date picker, showtimes | – |
| `/showtime?id=` | Seat map, seat selection, price summary | login needed to continue |
| `/checkout?bookingId=` | Countdown timer, Stripe Payment Element (Card / PromptPay QR) | ✓ |
| `/checkout/complete` | Stripe `return_url`. Polls the booking until `CONFIRMED` / failed | ✓ |
| `/bookings` | My bookings | ✓ |
| `/booking?id=` | Ticket with QR code | ✓ |
| `/login`, `/register` | Auth forms | – |
| `/er-diagram` | Dev page: database review | – |

- [x] Next.js app scaffolded, static export working
- [x] `/er-diagram` page
- [ ] App shell: header, auth menu, layout, error and loading states
- [ ] Each page in the table above
- [ ] Route guard (client-side): redirect to `/login?next=...`
- [ ] Responsive (mobile first). Seat map usable on a phone

---

## 7. Frontend Standards

### 7.1 State: server state vs client state

| Kind | Owner | Examples |
|---|---|---|
| **Server state**: data that lives in the DB | **TanStack Query** | movies, showtimes, seat map, my bookings, current user |
| **Client state**: global, UI-only, never in the DB | **Zustand** | `useAuthStore`: access token + user (memory only, not persisted) |
| **Local UI state**: one feature only | `useState` / `useReducer` | selected seats (owned by the seat-picker page component, passed to map and summary) |
| **Form state** | **React Hook Form** | login and register inputs |
| **URL state** | search params | genre filter, selected date, movie slug |

Rules:
- Never copy server data into Zustand. If it comes from the API, it lives in the Query cache.
- Query keys come from orval-generated helpers (e.g. `getGetMovieQueryKey(slug)`), never inline arrays.
- Mutations invalidate the queries they affect. For example, after `POST /bookings`, invalidate `seats(showtimeId)`.
- Zustand holds the session only (decision D3). Components read it with selectors. Add a store only when state is truly global.
- Filters and selected dates live in the URL, so they can be shared and survive a refresh.

### 7.2 Forms
- Every form is React Hook Form + `zodResolver(schema)`. Types come from `z.infer<typeof schema>`.
- Server validation errors (e.g. "email already used") map back onto fields with `setError`.

### 7.3 Proposed folder structure (`apps/web/src`)
```
app/                    # routes only, thin
features/
  auth/                 # store.ts (Zustand), schemas.ts (form extensions), components/
  movies/
  showtimes/            # seat map lives here
  bookings/
  payments/
api/
  generated/            # orval output, never edited by hand
lib/
  api-client.ts         # custom fetch used by orval: base URL, auth header, 401 → refresh → retry
  query-client.ts
components/ui/          # shared presentational components
```

### 7.4 Decisions (approved 2026-10-28)
- [x] **D1 API types: OpenAPI codegen.** NestJS DTOs + `@nestjs/swagger` are the source of truth. `orval` generates
  `apps/web/src/api/generated/*` (fetchers, Query hooks, Zod schemas). Run `npm run api:generate` after API changes.
  Generated Zod schemas are reused in forms (`zodResolver`), extended where the UI needs more (e.g. confirm password).
- [x] **D2 Auth: access token in memory + refresh token in an httpOnly cookie.** On app load, `POST /auth/refresh`
  restores the session. The api-client attaches `Authorization: Bearer`, and on a `401` it refreshes once and retries
  (concurrent 401s share one refresh request).
- [x] **D3 Zustand: session only.** Seat selection is local state in the seat-picker page.
- [x] **D4 UI: shadcn/ui** (Radix + Tailwind), including its `Form` components wired to React Hook Form.

---

## 8. Roadmap to the MVP

| Phase | Work | Done when |
|---|---|---|
| **0. Design** | ER diagram, endpoint list, frontend standards decisions (D1–D4 ✅) | ER diagram approved |
| **1. Foundation** | `apps/api` (NestJS), Docker Compose Postgres, Prisma schema + migrations + seed, health, config, Swagger. Web: providers (Query, Zustand), api-client, app shell | `GET /health` OK, seed loads, web calls the API |
| **2. Auth** | Register, login, refresh, logout, me. Login/register pages | Can sign up, log in, refresh survives a page reload |
| **3. Catalog** | Movies, genres, cinemas, showtimes endpoints and pages | Can browse to a showtime |
| **4. Booking** | Seat map endpoint and UI, hold seats, expiry job, concurrency test | Can hold seats, holds expire |
| **5. Payment** | PaymentIntent, Payment Element (card + PromptPay), webhook, complete page | Test Mastercard and PromptPay both confirm a booking |
| **6. Tickets** | Signed ticket QR, My bookings, ticket page | Ticket QR displayed |
| **7. Quality** | Unit + e2e tests, Playwright happy path, GitHub Actions CI | CI green on every PR |
| **8. AWS** | Manual deploy first (VPC, RDS, ECR, ECS Fargate, ALB, S3, CloudFront, Route 53, ACM), then Terraform + CD through GitHub OIDC | Live on your domain |

### AWS cost reminders
- Turn on an **AWS Budgets alert on day one**
- NAT Gateway (about $32/month) is the most common surprise. Consider VPC endpoints or a single NAT
- RDS `db.t4g.micro` is free tier eligible for 12 months
- Tear down environments you aren't using

---

## 9. After the MVP (backlog)

- Admin UI: CRUD for movies, cinemas, halls, showtimes, and seat layout editor
- Real-time seat updates (WebSocket / SSE)
- Redis for seat holds and caching
- Email tickets (AWS SES)
- Cancellation and refunds
- Door check-in scanner (uses `checked_in_at`)
- Google login
- Poster uploads to S3 (presigned URLs)
- AWS WAF, CloudWatch dashboards and alarms

---

## 10. Production-Readiness Checklist

- [ ] Secrets in Secrets Manager / SSM, never in git
- [ ] Env validation at startup
- [ ] Health check used by the ALB
- [ ] Structured JSON logs with request ids
- [ ] Migrations run as a separate step before deploy
- [ ] Graceful shutdown
- [ ] Rate limiting on auth
- [ ] Helmet, HTTP-only `Secure` `SameSite` refresh cookie
- [ ] Stripe webhook signature check and idempotency
- [ ] Booking confirmed only by the webhook, never by the client
- [ ] Least-privilege IAM roles
- [ ] RDS automated backups
- [ ] Budget and error alarms

---

## 11. Decisions Log (grilling sessions)

### Round 1 (2026-10-28)
| # | Topic | Decision |
|---|---|---|
| G1 | MVP done | Runs locally on Docker Compose, all unit / integration / e2e tests pass. Tests are written after features |
| G2 | Stripe | Thai Stripe account, so card + PromptPay are both available |
| G3 | Login gate | Browse and pick seats as a guest. Login is required only when buying |
| G4 | Hold / payment TTL | *Discussing:* payment window 5 min, seat hold ≤ 6 min, no payment accepted after the window |
| G5 | Limits | Max **4 seats** per booking. **No refunds or cancellation after payment.** Booking cut-off: *confirming* |
| G6 | Seed data | Dev dataset of real current and next-month movies. *Source and posters: discussing* |
| G7 | Language | **Thai default**, English second. *Approach: discussing* |
| G8 | Git | Git now, commit at meaningful checkpoints |
