#!/usr/bin/env bash
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Creates the least-privilege roles from docs/security.md DB-2:
#   migrator : owns the databases and every object in them, runs DDL (Prisma Migrate).
#   app_user : DML only. Gets SELECT/INSERT/UPDATE/DELETE + sequence usage on everything
#              migrator creates (ALTER DEFAULT PRIVILEGES). No DDL, not a superuser.
# Passwords come from the environment (see docker-compose.yml / .env.example).
set -euo pipefail

: "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD is required}"
: "${APP_USER_PASSWORD:?APP_USER_PASSWORD is required}"
: "${APP_DB:?APP_DB is required}"
: "${APP_TEST_DB:?APP_TEST_DB is required}"

psql_su() { psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" "$@"; }

# CREATEDB lets `prisma migrate dev` create its shadow database (dev only).
psql_su --dbname postgres \
  -v migrator_pw="$MIGRATOR_PASSWORD" -v app_pw="$APP_USER_PASSWORD" <<'SQL'
CREATE ROLE migrator LOGIN PASSWORD :'migrator_pw' CREATEDB NOSUPERUSER NOCREATEROLE;
CREATE ROLE app_user LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL

for db in "$APP_DB" "$APP_TEST_DB"; do
  psql_su --dbname postgres -v db="$db" <<'SQL'
CREATE DATABASE :"db" OWNER migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO app_user;
SQL

  psql_su --dbname "$db" <<'SQL'
-- The default schema belongs to migrator; nobody else may create objects in it.
ALTER SCHEMA public OWNER TO migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

-- Objects migrator creates later automatically become usable (DML only) by app_user.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
SQL
done
