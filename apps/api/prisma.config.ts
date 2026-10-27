import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrate, studio, ...) always connects as `migrator` (DDL rights).
// The running application connects as `app_user` via DATABASE_URL (PrismaService).
//
// `prisma generate` needs no database, so CI can run it without a `.env`: the datasource is only
// attached when MIGRATION_DATABASE_URL is set. Migrate commands then fail with Prisma's
// "datasource url is required" error instead of silently using a wrong database.
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
