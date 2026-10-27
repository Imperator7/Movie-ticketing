-- Hand-written: things Prisma cannot express. See docs/database-design.md §2, §9, §13, §17 and security DB-1.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ===== Partial unique indexes =====

-- §2 Seat lock: a seat can have only one active (unreleased) lock per showtime.
CREATE UNIQUE INDEX "booking_seats_active_uniq"
  ON "booking_seats" ("showtime_id", "seat_id")
  WHERE "released_at" IS NULL;

-- §13 One PENDING_PAYMENT booking per user.
CREATE UNIQUE INDEX "bookings_one_pending_per_user"
  ON "bookings" ("user_id")
  WHERE "status" = 'PENDING_PAYMENT';

-- §12 Email is optional (LINE may not share it) but unique when present.
CREATE UNIQUE INDEX "users_email_uniq"
  ON "users" ("email")
  WHERE "email" IS NOT NULL;

-- ===== CHECK constraints (§17) =====

ALTER TABLE "showtime_prices" ADD CONSTRAINT "showtime_prices_price_baht_positive" CHECK ("price_baht" > 0);
ALTER TABLE "booking_seats"   ADD CONSTRAINT "booking_seats_price_baht_positive"   CHECK ("price_baht" > 0);
ALTER TABLE "bookings"        ADD CONSTRAINT "bookings_total_baht_positive"         CHECK ("total_baht" > 0);
ALTER TABLE "bookings"        ADD CONSTRAINT "bookings_payment_before_hold"         CHECK ("payment_expires_at" < "hold_expires_at");
ALTER TABLE "bookings"        ADD CONSTRAINT "bookings_cancel_reason_iff_cancelled" CHECK (("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL));
ALTER TABLE "bookings"        ADD CONSTRAINT "bookings_confirmed_at_iff_confirmed"  CHECK (("status" = 'CONFIRMED') = ("confirmed_at" IS NOT NULL));
ALTER TABLE "payments"        ADD CONSTRAINT "payments_amount_baht_positive"        CHECK ("amount_baht" > 0);
ALTER TABLE "showtimes"       ADD CONSTRAINT "showtimes_ends_after_starts"          CHECK ("ends_at" > "starts_at");
ALTER TABLE "movies"          ADD CONSTRAINT "movies_duration_min_positive"         CHECK ("duration_min" > 0);
ALTER TABLE "users"           ADD CONSTRAINT "users_email_lowercase"                CHECK ("email" IS NULL OR "email" = lower("email"));

-- ===== §9 Showtimes in one hall must not overlap (cancelled ones are ignored) =====

ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_no_overlap"
  EXCLUDE USING gist ("hall_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" = 'SCHEDULED');

-- ===== Grants =====
-- app_user gets DML on everything migrator creates via ALTER DEFAULT PRIVILEGES
-- (docker/postgres/init). Prisma's own bookkeeping table is DDL-side only, so take it away again.
-- (Guarded: the table does not exist in Prisma's shadow database.)
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM "app_user";
  END IF;
END
$$;
