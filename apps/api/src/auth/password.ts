import { hash, verify } from "@node-rs/argon2";

/** argon2id (the library default), 19 MiB, 2 passes, 1 lane (OWASP minimum recommendation). Stored in the PHC string, so it can be raised later. */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Never throws: a malformed hash simply does not match. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
