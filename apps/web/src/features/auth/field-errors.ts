import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

/** `details.fields` of a `VALIDATION_FAILED` error: `{ "<field.path>": ["<zod issue code>"] }`. */
export function serverFieldIssues(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") return {};
  const fields = error.details?.fields;
  if (typeof fields !== "object" || fields === null) return {};
  const result: Record<string, string[]> = {};
  for (const [path, codes] of Object.entries(fields)) {
    if (Array.isArray(codes)) {
      result[path] = codes.filter((c): c is string => typeof c === "string");
    }
  }
  return result;
}

export interface AppliedFieldErrors {
  /** Form fields that received an error. */
  fields: string[];
  /** Server issues that don't belong to a form field (`_root`, unknown keys...). */
  unmatched: string[];
}

/**
 * Maps the server's `details.fields` onto React Hook Form with `setError`. `translate` turns
 * (field, zod issue code) into the message to show.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  formFields: readonly string[],
  translate: (field: string, code: string) => string,
): AppliedFieldErrors {
  const applied: AppliedFieldErrors = { fields: [], unmatched: [] };
  for (const [path, codes] of Object.entries(serverFieldIssues(error))) {
    const code = codes[0];
    if (code === undefined) continue;
    if (formFields.includes(path)) {
      setError(path as FieldPath<T>, { type: code, message: translate(path, code) });
      applied.fields.push(path);
    } else {
      applied.unmatched.push(path);
    }
  }
  return applied;
}
