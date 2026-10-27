-- Proves the hand-written constraints and role grants work. Leaves the database untouched (ROLLBACK).
--
-- Run (superuser is needed only to SET ROLE to app_user; it is not used for the DML checks):
--   docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d movie_ticketing \
--     < apps/api/prisma/verify-constraints.sql
-- or: npm run db:verify
--
-- Every check prints "PASS: ..." or aborts the script with an exception.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
SET client_min_messages = notice;

BEGIN;

-- expect_error(sql, sqlstate, label): runs sql, passes only if it fails with that SQLSTATE.
-- 23505 unique, 23514 check, 23P01 exclusion, 42501 insufficient privilege.
CREATE FUNCTION pg_temp.expect_error(stmt text, expected text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN
      RAISE NOTICE 'PASS: % (rejected: % / %)', label, SQLSTATE, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % - expected %, got % (%)', label, expected, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: % - statement succeeded but should have failed', label;
END $$;

CREATE FUNCTION pg_temp.expect_ok(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'PASS: % (accepted)', label;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'FAIL: % - should have succeeded, got % (%)', label, SQLSTATE, SQLERRM;
END $$;

-- ===== Fixtures (fixed ids, rolled back at the end) =====
INSERT INTO users (id, email, display_name, preferred_locale, updated_at) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com', 'A', 'th', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'b@example.com', 'B', 'en', now());

INSERT INTO movies (id, slug, title_th, title_en, synopsis_th, synopsis_en, duration_min, rating,
                    original_language, release_date, poster_url, status, updated_at)
VALUES ('00000000-0000-0000-0000-0000000000b1', 'verify-movie', 't', 't', 's', 's', 120, 'GENERAL',
        'en', '2026-01-01', 'http://x', 'NOW_SHOWING', now());

INSERT INTO cinemas (id, name_th, name_en, address_th, address_en, city)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'c', 'c', 'a', 'a', 'Bangkok');

INSERT INTO halls (id, cinema_id, number, type, total_rows, total_cols)
VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 1, 'STANDARD', 1, 2);

INSERT INTO seats (id, hall_id, row_label, seat_number, grid_row, grid_col, type) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'A', 1, 0, 0, 'STANDARD');

INSERT INTO showtimes (id, movie_id, hall_id, starts_at, ends_at, audio_language, format, status) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000d1', '2030-01-01 10:00+00', '2030-01-01 12:00+00', 'EN', 'TWO_D', 'SCHEDULED');

-- Bookings: B1 (user A, pending) and B2 (user B, pending), both for showtime f1.
INSERT INTO bookings (id, booking_code, user_id, showtime_id, status, total_baht, payment_expires_at, hold_expires_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'MT-AAAAAA', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000f1', 'PENDING_PAYMENT', 220, now() + interval '5 min', now() + interval '6 min', now()),
  ('00000000-0000-0000-0000-000000000102', 'MT-BBBBBB', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000f1', 'PENDING_PAYMENT', 220, now() + interval '5 min', now() + interval '6 min', now());

\echo '--- 1. Seat lock (partial unique index) ---'
INSERT INTO booking_seats (booking_id, showtime_id, seat_id, price_baht)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000e1', 220);
SELECT pg_temp.expect_error($q$
  INSERT INTO booking_seats (booking_id, showtime_id, seat_id, price_baht)
  VALUES ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000e1', 220)$q$, '23505', 'same seat locked twice for a showtime');
UPDATE booking_seats SET released_at = now() WHERE booking_id = '00000000-0000-0000-0000-000000000101';
SELECT pg_temp.expect_ok($q$
  INSERT INTO booking_seats (booking_id, showtime_id, seat_id, price_baht)
  VALUES ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000e1', 220)$q$, 'seat can be locked again after released_at is set');

\echo '--- 2. One PENDING_PAYMENT booking per user ---'
SELECT pg_temp.expect_error($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-CCCCCC', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
          'PENDING_PAYMENT', 220, now() + interval '5 min', now() + interval '6 min', now())$q$,
  '23505', 'second PENDING_PAYMENT booking for the same user');
SELECT pg_temp.expect_ok($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, cancel_reason, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-DDDDDD', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1',
          'CANCELLED', 'USER_CANCELLED', 220, now() + interval '5 min', now() + interval '6 min', now())$q$,
  'a CANCELLED booking for the same user is fine');

\echo '--- 3. Showtime no-overlap exclusion ---'
SELECT pg_temp.expect_error($q$
  INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, audio_language, format, status)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
          '2030-01-01 11:00+00', '2030-01-01 13:00+00', 'EN', 'TWO_D', 'SCHEDULED')$q$,
  '23P01', 'overlapping SCHEDULED showtime in the same hall');
SELECT pg_temp.expect_ok($q$
  INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, audio_language, format, status)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
          '2030-01-01 11:00+00', '2030-01-01 13:00+00', 'EN', 'TWO_D', 'CANCELLED')$q$,
  'overlapping CANCELLED showtime is allowed');
SELECT pg_temp.expect_ok($q$
  INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, audio_language, format, status)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
          '2030-01-01 12:00+00', '2030-01-01 14:00+00', 'EN', 'TWO_D', 'SCHEDULED')$q$,
  'back-to-back SCHEDULED showtime (touching ranges) is allowed');

\echo '--- 4. CHECK constraints ---'
SELECT pg_temp.expect_error($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, cancel_reason, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-E1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'CANCELLED',
          'USER_CANCELLED', 220, now() + interval '6 min', now() + interval '6 min', now())$q$,
  '23514', 'payment_expires_at >= hold_expires_at');
SELECT pg_temp.expect_error($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-E2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'CANCELLED',
          220, now() + interval '5 min', now() + interval '6 min', now())$q$,
  '23514', 'CANCELLED booking without cancel_reason');
SELECT pg_temp.expect_error($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, cancel_reason, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-E3', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'CONFIRMED',
          NULL, 220, now() + interval '5 min', now() + interval '6 min', now())$q$,
  '23514', 'CONFIRMED booking without confirmed_at');
SELECT pg_temp.expect_error($q$
  INSERT INTO bookings (booking_code, user_id, showtime_id, status, cancel_reason, total_baht, payment_expires_at, hold_expires_at, updated_at)
  VALUES ('MT-E4', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'CANCELLED',
          'USER_CANCELLED', 0, now() + interval '5 min', now() + interval '6 min', now())$q$,
  '23514', 'bookings.total_baht = 0');
SELECT pg_temp.expect_error($q$
  INSERT INTO booking_seats (booking_id, showtime_id, seat_id, price_baht)
  VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000e1', 0)$q$, '23514', 'booking_seats.price_baht = 0');
SELECT pg_temp.expect_error($q$
  INSERT INTO showtime_prices (showtime_id, seat_type, price_baht)
  VALUES ('00000000-0000-0000-0000-0000000000f1', 'STANDARD', -5)$q$, '23514', 'showtime_prices.price_baht < 0');
SELECT pg_temp.expect_error($q$
  INSERT INTO payments (booking_id, stripe_payment_intent_id, method, status, amount_baht, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000101', 'pi_x', 'CARD', 'PENDING', 0, now())$q$,
  '23514', 'payments.amount_baht = 0');
SELECT pg_temp.expect_error($q$
  INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, audio_language, format)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
          '2031-01-01 10:00+00', '2031-01-01 10:00+00', 'EN', 'TWO_D')$q$, '23514', 'showtimes.ends_at <= starts_at');
SELECT pg_temp.expect_error($q$
  UPDATE movies SET duration_min = 0 WHERE slug = 'verify-movie'$q$, '23514', 'movies.duration_min = 0');
SELECT pg_temp.expect_error($q$
  INSERT INTO users (email, display_name, preferred_locale, updated_at) VALUES ('Upper@Example.com', 'U', 'th', now())$q$,
  '23514', 'uppercase email');
SELECT pg_temp.expect_error($q$
  INSERT INTO users (email, display_name, preferred_locale, updated_at) VALUES ('a@example.com', 'dup', 'th', now())$q$,
  '23505', 'duplicate email (partial unique)');
SELECT pg_temp.expect_ok($q$
  INSERT INTO users (email, display_name, preferred_locale, updated_at) VALUES (NULL, 'n1', 'th', now()), (NULL, 'n2', 'th', now())$q$,
  'several users with NULL email');

\echo '--- 5. app_user privileges (DML only, no DDL) ---'
RESET ROLE;
SET LOCAL ROLE app_user;
DO $$
DECLARE n int;
BEGIN
  INSERT INTO users (email, display_name, preferred_locale, updated_at) VALUES ('role@example.com', 'R', 'th', now());
  SELECT count(*) INTO n FROM users WHERE email = 'role@example.com';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: app_user SELECT after INSERT'; END IF;
  UPDATE users SET display_name = 'R2' WHERE email = 'role@example.com';
  DELETE FROM users WHERE email = 'role@example.com';
  RAISE NOTICE 'PASS: app_user can INSERT / SELECT / UPDATE / DELETE';

  BEGIN
    EXECUTE 'CREATE TABLE evil (id int)';
    RAISE EXCEPTION 'FAIL: app_user created a table';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: app_user cannot CREATE TABLE (%)', SQLERRM;
  END;

  BEGIN
    EXECUTE 'DROP TABLE users CASCADE';
    RAISE EXCEPTION 'FAIL: app_user dropped a table';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: app_user cannot DROP TABLE (%)', SQLERRM;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE users ADD COLUMN x int';
    RAISE EXCEPTION 'FAIL: app_user altered a table';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: app_user cannot ALTER TABLE (%)', SQLERRM;
  END;

  BEGIN
    EXECUTE 'SELECT 1 FROM _prisma_migrations';
    RAISE EXCEPTION 'FAIL: app_user can read _prisma_migrations';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: app_user cannot touch _prisma_migrations (%)', SQLERRM;
  END;

  -- bigint identity sequence of booking_events must be usable without extra grants.
  INSERT INTO booking_events (booking_id, type, actor)
  VALUES ('00000000-0000-0000-0000-000000000101', 'CREATED', 'SYSTEM');
  RAISE NOTICE 'PASS: app_user can insert into booking_events (sequence usage granted)';
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE EXCEPTION 'FAIL: app_user has elevated role attributes';
  END IF;
  RAISE NOTICE 'PASS: app_user is not superuser / createdb / createrole';
END $$;

ROLLBACK;
\echo 'All checks passed. Transaction rolled back, database left clean.'
