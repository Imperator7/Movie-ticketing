/**
 * The operationIds of docs/openapi.yaml that the API implements so far.
 *
 * The contract describes the whole product up front, so most of it is not built yet. This list scopes the contract
 * test to what exists, and it is kept exact in BOTH directions:
 * - an operation implemented in code but missing here fails the test (so new endpoints cannot skip the check),
 * - an operation listed here but not implemented (or not in the contract) fails too.
 * Add the ids when a phase lands: Phase 4 adds getShowtime, getSeatMap, createBooking, ...
 */
export const IMPLEMENTED_OPERATIONS = [
  // Health
  "getLiveness",
  "getReadiness",
  // Auth (Phase 2)
  "register",
  "login",
  "refresh",
  "logout",
  "getMe",
  // Catalog (Phase 3)
  "listGenres",
  "listCinemas",
  "listMovies",
  "getMovie",
  "listMovieShowtimes",
  // Showtimes (Phase 4)
  "getShowtime",
  "getSeatMap",
  // Bookings (Phase 4)
  "createBooking",
  "getActiveBooking",
  "listMyBookings",
  "getBooking",
  "cancelBooking",
  // Payments (Phase 5)
  "createPaymentIntent",
  "stripeWebhook",
] as const;
