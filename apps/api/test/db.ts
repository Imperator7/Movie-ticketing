import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client.js";

let client: PrismaClient | undefined;

/** A small raw-SQL helper (as app_user) for asserting what is really stored. */
export async function queryOne<T>(sql: string, params: unknown[]): Promise<T | undefined> {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("databaseUrl"), max: 2 }),
  });
  const rows = await client.$queryRawUnsafe<T[]>(sql, ...params);
  return rows[0];
}
