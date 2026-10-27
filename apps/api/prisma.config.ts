import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma CLI (migrate, studio, ...) always connects as `migrator` (DDL rights).
// The running application connects as `app_user` via DATABASE_URL in PrismaService (later item).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("MIGRATION_DATABASE_URL"),
  },
});
