import type { CancelReason, BookingStatus, PaymentSummary } from "@/api/generated/model";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo-password-123";

export interface MockUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  phone: string | null;
  preferredLocale: "th" | "en";
}

export interface MockBooking {
  id: string;
  code: string;
  userId: string;
  showtimeId: string;
  seatIds: string[];
  totalBaht: number;
  status: BookingStatus;
  cancelReason: CancelReason | null;
  createdAt: number;
  paymentExpiresAt: number;
  holdExpiresAt: number;
  confirmedAt: number | null;
  cancelledAt: number | null;
  payment: PaymentSummary | null;
}

export type PayOutcome = "success" | "decline" | "late";

export interface PendingSettlement {
  bookingId: string;
  at: number;
  result: "confirm" | "late";
  method: "CARD" | "PROMPTPAY";
}

/** Everything the mock server remembers. Persisted in sessionStorage so reloads keep the demo going. */
export interface MockDb {
  version: 1;
  users: MockUser[];
  /** The "refresh cookie": the user the httpOnly `rt` cookie would belong to. */
  refreshUserId: string | null;
  bookings: MockBooking[];
  idempotency: Record<string, { fingerprint: string; bookingId: string }>;
  /** Seats taken by "someone else" (demo control), as confirmed bookings of another user. */
  externalSeatIds: string[];
  outcome: PayOutcome;
  settlements: PendingSettlement[];
  nextCode: number;
}

export const DEMO_USER_ID = "u0000000-0000-4000-8000-000000000001";

export function createDb(): MockDb {
  return {
    version: 1,
    users: [
      {
        id: DEMO_USER_ID,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        displayName: "สมชาย ใจดี",
        phone: "0812345678",
        preferredLocale: "th",
      },
    ],
    refreshUserId: null,
    bookings: [],
    idempotency: {},
    externalSeatIds: [],
    outcome: "success",
    settlements: [],
    nextCode: 1,
  };
}

const STORAGE_KEY = "movie-ticketing:mock-db:v1";
let cached: MockDb | null = null;

function isMockDb(value: unknown): value is MockDb {
  return typeof value === "object" && value !== null && "version" in value && value.version === 1;
}

/** Loads the db from sessionStorage (or seeds a new one). */
export function loadDb(): MockDb {
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isMockDb(parsed)) {
        cached = parsed;
        return cached;
      }
    }
  } catch {
    // Unavailable or corrupt storage: start fresh.
  }
  cached = createDb();
  return cached;
}

export function saveDb(db: MockDb): void {
  cached = db;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: the in-memory copy still works for this page load.
  }
}

export function resetDb(): MockDb {
  cached = createDb();
  saveDb(cached);
  return cached;
}
