/** Unwraps a value that must exist (a bug if it does not), without a non-null assertion. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Seed invariant violated: missing ${what}`);
  }
  return value;
}
