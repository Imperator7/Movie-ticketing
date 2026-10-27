/** Emails are trimmed and lowercased before every lookup and insert (the DB has a lowercase CHECK). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
