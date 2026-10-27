const MINUTE_MS = 60_000;

/** Business rules from docs/database-design.md. Never use these numbers inline anywhere else. */
export const BOOKING_CONFIG = {
  /** Max seats per booking. */
  MAX_SEATS: 4,
  /** Time to pay after the booking is created (payment_expires_at). */
  PAYMENT_WINDOW_MS: 5 * MINUTE_MS,
  /** Seat hold after the booking is created (hold_expires_at). Always longer than the payment window. */
  SEAT_HOLD_MS: 6 * MINUTE_MS,
  /** Booking stays open until this long after the showtime starts. */
  CUTOFF_AFTER_START_MS: 30 * MINUTE_MS,
} as const;

export type BookingConfig = typeof BOOKING_CONFIG;
