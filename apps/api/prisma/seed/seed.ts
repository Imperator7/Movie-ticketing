import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { runSeed } from "./run-seed.js";

/** `npm run seed -w api`: connects as app_user (DATABASE_URL), idempotent, works without a TMDB key. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write(
      "DATABASE_URL is not set (copy apps/api/.env.example to apps/api/.env).\n",
    );
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  try {
    const log = (message: string): void => {
      process.stdout.write(`${message}\n`);
    };
    const summary = await runSeed(prisma, { log });
    log(
      `Window: ${summary.today} + 30 days (Bangkok). Showtimes added this run: ${String(summary.showtimesAdded)}`,
    );
    log("Rows per table:");
    for (const [table, count] of Object.entries(summary.counts))
      log(`  ${table.padEnd(16)} ${String(count)}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
