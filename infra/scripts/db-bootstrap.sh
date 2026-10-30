#!/bin/sh
# Phase 4: creates the database roles and the app database on RDS. The AWS version of
# docker/postgres/init/01-roles-and-databases.sh (docs/security.md DB-2):
#   migrator : owns the database and every table in it, runs migrations (DDL).
#   app_user : rows only (SELECT/INSERT/UPDATE/DELETE), on everything migrator creates.
# Runs as the one-off ECS task `db-bootstrap` (postgres:17-alpine image, ecs.tf) as the RDS admin user. Safe to run
# again: it creates what is missing and resets the two passwords to the ones in SSM.
# Env: PGHOST, PGUSER, PGPASSWORD, APP_DB, MIGRATOR_PASSWORD, APP_USER_PASSWORD (the secrets come from SSM).
set -eu

# AWS RDS root certificates, so psql checks it is talking to the real database (PGSSLMODE=verify-full).
wget -qO /tmp/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
echo "90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b  /tmp/rds-ca.pem" | sha256sum -c -
export PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/rds-ca.pem PGDATABASE=postgres

psql -v ON_ERROR_STOP=1 -v migrator_pw="$MIGRATOR_PASSWORD" -v app_pw="$APP_USER_PASSWORD" \
  -v db="$APP_DB" -v admin="$PGUSER" <<'SQL'
-- Roles. New roles are NOSUPERUSER NOCREATEDB NOCREATEROLE by default (the RDS admin can't set SUPERUSER anyway).
SELECT 'CREATE ROLE migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator') \gexec
SELECT 'CREATE ROLE app_user LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') \gexec
SELECT format('ALTER ROLE migrator WITH LOGIN PASSWORD %L', :'migrator_pw') \gexec
SELECT format('ALTER ROLE app_user WITH LOGIN PASSWORD %L', :'app_pw') \gexec

-- The RDS admin is not a real superuser: to create a database owned by migrator (and change its schema) it must
-- be a member of migrator.
SELECT format('GRANT migrator TO %I', :'admin') \gexec

SELECT format('CREATE DATABASE %I OWNER migrator', :'db')
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO app_user', :'db') \gexec

\connect :db

-- The default schema belongs to migrator; nobody else may create objects in it.
ALTER SCHEMA public OWNER TO migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tables migrator creates later automatically become usable (rows only) by app_user.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Show the result in the task log.
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname IN ('migrator', 'app_user');
SQL

echo "db-bootstrap: done"
