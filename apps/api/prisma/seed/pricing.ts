export type HallKind = "STANDARD" | "IMAX" | "FOUR_DX";

export interface ShowtimePrices {
  STANDARD: number;
  PREMIUM: number;
}

const BASE_BAHT = 200;
const PREMIUM_EXTRA_BAHT = 60;
const EVENING_EXTRA_BAHT = 30;
const WEEKEND_EXTRA_BAHT = 20;
const HALL_EXTRA_BAHT: Record<HallKind, number> = { STANDARD: 0, IMAX: 150, FOUR_DX: 100 };

/** Evening = starts 17:00 Bangkok or later. */
export const EVENING_FROM_MINUTE = 17 * 60;

/**
 * Whole-baht prices for one showtime. Standard hall: 200 (matinee weekday) to 250 (weekend evening).
 * PREMIUM is +60. IMAX adds +150, 4DX +100.
 *
 * @param startMinute minutes after 00:00 Bangkok that the show starts
 * @param weekday 0 = Sunday ... 6 = Saturday (Bangkok calendar day)
 */
export function priceShowtime(input: {
  hallType: HallKind;
  startMinute: number;
  weekday: number;
}): ShowtimePrices {
  const evening = input.startMinute >= EVENING_FROM_MINUTE ? EVENING_EXTRA_BAHT : 0;
  const weekend = input.weekday === 0 || input.weekday === 6 ? WEEKEND_EXTRA_BAHT : 0;
  const standard = BASE_BAHT + HALL_EXTRA_BAHT[input.hallType] + evening + weekend;
  return { STANDARD: standard, PREMIUM: standard + PREMIUM_EXTRA_BAHT };
}
