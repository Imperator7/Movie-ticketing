import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

/**
 * Starts ONE Postgres 17 container for the whole integration run, applies the real migrations as
 * `migrator` (so partial indexes, CHECKs and grants are exactly what production gets), and hands the
 * `app_user` URL to the specs through `inject("databaseUrl")`.
 */

// Must match docker-compose.yml.
const POSTGRES_IMAGE = "postgres:17.6-alpine";
const DATABASE = "movie_ticketing_test";
const MIGRATOR_PASSWORD = "it_migrator_pw";
const APP_USER_PASSWORD = "it_app_user_pw";

let container: StartedPostgreSqlContainer | undefined;

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DATABASE)
    .withUsername("postgres")
    .withPassword("it_superuser_pw")
    .start();

  // Same role model as docker/postgres/init: migrator owns the schema, app_user only gets DML.
  await container.exec([
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-c",
    `CREATE ROLE migrator LOGIN PASSWORD '${MIGRATOR_PASSWORD}' CREATEDB;
     CREATE ROLE app_user LOGIN PASSWORD '${APP_USER_PASSWORD}';
     ALTER DATABASE ${DATABASE} OWNER TO migrator;
     REVOKE ALL ON DATABASE ${DATABASE} FROM PUBLIC;
     GRANT CONNECT ON DATABASE ${DATABASE} TO app_user;
     ALTER SCHEMA public OWNER TO migrator;
     REVOKE ALL ON SCHEMA public FROM PUBLIC;
     GRANT USAGE ON SCHEMA public TO app_user;
     ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
     ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;`,
  ]);

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string): string =>
    `postgresql://${user}:${password}@${host}:${String(port)}/${DATABASE}?schema=public`;

  // Apply the committed migrations as migrator (the same command production deploys run).
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, MIGRATION_DATABASE_URL: url("migrator", MIGRATOR_PASSWORD) },
    stdio: "inherit",
  });

  project.provide("databaseUrl", url("app_user", APP_USER_PASSWORD));
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
