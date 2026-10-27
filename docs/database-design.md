# Database Design (MVP)

PostgreSQL. The ER diagram source lives in [`er-diagram.mmd`](./er-diagram.mmd) and is rendered at `/er-diagram`.

## Scope

The MVP covers the customer side only: sign up, browse movies, pick a showtime and seats, pay with
**card (Mastercard/Visa)** or **PromptPay QR** through Stripe, and receive a ticket QR code.
There is no admin UI yet. Movies, cinemas, halls, seats and showtimes come from a **seed script**.

## Key design decisions

### 1. Money is stored as whole baht (integers)
`price_baht = 220` means ฿220. Cinema prices are whole baht, so there are no satang and floats are never used for money.
- **Stripe is the one exception.** It expects THB in satang, so the payments module converts in a single helper:
  `toStripeAmount(baht) = baht * 100`. Nothing else in the codebase deals with satang.
- **Rule:** any future discount or fee must be rounded to whole baht before it is stored.

### 2. Double-booking is prevented by the database
`BOOKING_SEATS` has a **partial unique index**:

```sql
CREATE UNIQUE INDEX booking_seats_active_uniq
  ON booking_seats (showtime_id, seat_id)
  WHERE released_at IS NULL;
```

If two users click the same seat at the same moment, one `INSERT` succeeds and the other fails with a
unique violation, which the API turns into `409 Conflict`. When a booking expires or is cancelled, its rows
get `released_at = now()`, so the seat becomes free again while the history is kept.
`showtime_id` is copied onto `BOOKING_SEATS` (denormalized) so this index can exist.

> Prisma can't express partial indexes in `schema.prisma`, so this goes into a hand-written SQL migration.

### 3. Seat holds use `BOOKINGS.expires_at` (no Redis in the MVP)
- `POST /bookings` → status `PENDING_PAYMENT`, `expires_at = now + 10 min`
- Payment succeeds → `CONFIRMED`
- A scheduled job (every minute) sets expired `PENDING_PAYMENT` bookings to `EXPIRED` and releases their seats
- Seat availability = seats with no active (`released_at IS NULL`) row for that showtime

### 4. Prices per showtime and seat type
`SHOWTIME_PRICES` lets an evening IMAX show cost more than a matinee, and premium seats cost more than
standard ones. `BOOKING_SEATS.price_baht` stores a **snapshot**, so later price changes don't affect old bookings.

### 5. Payments are separate from bookings (1 : N)
A user may fail with one card and retry with PromptPay. Each attempt is a `PAYMENTS` row tied to one Stripe
PaymentIntent. The booking is confirmed by the **Stripe webhook**, never by the browser redirect.

### 6. Webhooks are idempotent
Stripe may deliver the same event more than once. Each event id is inserted into `STRIPE_EVENTS` first. If it
already exists, the event is skipped.

### 7. The ticket QR needs no extra table
The ticket QR encodes `booking_code` plus an HMAC signature, so it can't be forged. `checked_in_at` is
there for door scanning later.

### 8. Showtimes in a hall must not overlap
This uses a Postgres exclusion constraint (`btree_gist`), also in a raw SQL migration:

```sql
ALTER TABLE showtimes ADD CONSTRAINT showtimes_no_overlap
  EXCLUDE USING gist (hall_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'SCHEDULED');
```

### 9. Refresh tokens are stored hashed
Only a SHA-256 hash is stored. Tokens are rotated on every refresh, and the old one is revoked.

## Indexes (besides PK/UK)

| Table | Index | For |
|---|---|---|
| showtimes | `(movie_id, starts_at)` | showtimes of a movie by date |
| showtimes | `(hall_id, starts_at)` | hall schedule |
| bookings | `(user_id, created_at desc)` | "My bookings" |
| bookings | `(status, expires_at)` | expiry job |
| booking_seats | `(booking_id)` | load seats of a booking |
| payments | `(booking_id)` | payments of a booking |
| refresh_tokens | `(user_id)` | revoke all sessions |

## Enums

| Enum | Values |
|---|---|
| movie_rating | G, PG, PG13, R18, R20 |
| movie_status | COMING_SOON, NOW_SHOWING, ENDED |
| hall_type | STANDARD, IMAX, FOUR_DX |
| seat_type | STANDARD, PREMIUM, COUPLE |
| showtime_format | TWO_D, THREE_D, IMAX |
| showtime_status | SCHEDULED, CANCELLED |
| booking_status | PENDING_PAYMENT, CONFIRMED, EXPIRED, CANCELLED |
| payment_method | CARD, PROMPTPAY |
| payment_status | PENDING, SUCCEEDED, FAILED, CANCELLED |

## Open questions for review

1. **Couple seats**: one seat row priced as two people, or two linked seats? (Current: one row, type `COUPLE`.)
2. **Guest checkout**: the MVP requires login. Is that OK?
3. **Hold duration**: 10 minutes OK? PromptPay QR codes need time to scan and pay.
4. **Refunds/cancellation by user**: out of scope for the MVP?
