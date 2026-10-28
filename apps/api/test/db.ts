import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client.js";

let client: PrismaClient | undefined;

/** A shared client (as app_user) for fixtures and for asserting what is really stored. */
export function testPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("databaseUrl"), max: 3 }),
  });
  return client;
}

/** A small raw-SQL helper for asserting what is really stored. */
export async function queryOne<T>(sql: string, params: unknown[]): Promise<T | undefined> {
  const rows = await testPrisma().$queryRawUnsafe<T[]>(sql, ...params);
  return rows[0];
}
