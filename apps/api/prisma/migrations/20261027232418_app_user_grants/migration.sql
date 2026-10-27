-- Least-privilege grants for the application role (security DB-2), as a migration.
--
-- Why a migration: `prisma migrate reset` drops and recreates the `public` schema, which also drops every grant
-- and every schema-scoped default privilege that docker/postgres/init set up once. Keeping them here means any
-- database that reaches this migration (reset dev DB, Testcontainers, a fresh RDS instance) ends up correct.
--
-- Guarded: the role must be created outside migrations (docker init, Testcontainers setup, RDS bootstrap).
-- Prisma's shadow database also runs this, so it must not fail when objects are missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- Nobody but the owner (the role running migrations) may create objects in the schema.
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO app_user;

    -- Everything that exists now (tables from earlier migrations)...
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

    -- ...and everything later migrations create (they run as the same role as this one).
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO app_user;

    -- Prisma's bookkeeping table is DDL-side only (the GRANT ON ALL TABLES above just covered it).
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON TABLE "_prisma_migrations" FROM app_user;
    END IF;
  END IF;
END
$$;
