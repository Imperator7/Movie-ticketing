import type {
  Cinema,
  Genre,
  MovieDetail,
  MovieRating,
  Price,
  Seat,
  SeatStatus,
  SeatType,
  ShowtimeFormat,
} from "@/api/generated/model";

/**
 * Seed catalog for the mock server: movies, cinemas, halls and a deterministic showtime schedule
 * (a pure function of "today", so nothing about showtimes needs to be stored).
 */

export const genres: Genre[] = [
  { id: 1, slug: "action", name: { th: "แอ็กชัน", en: "Action" } },
  { id: 2, slug: "drama", name: { th: "ดราม่า", en: "Drama" } },
  { id: 3, slug: "sci-fi", name: { th: "ไซไฟ", en: "Sci-Fi" } },
  { id: 4, slug: "family", name: { th: "ครอบครัว", en: "Family" } },
  { id: 5, slug: "horror", name: { th: "สยองขวัญ", en: "Horror" } },
  { id: 6, slug: "comedy", name: { th: "ตลก", en: "Comedy" } },
  { id: 7, slug: "romance", name: { th: "โรแมนติก", en: "Romance" } },
];

function g(slug: string): Genre {
  const found = genres.find((x) => x.slug === slug);
  if (!found) throw new Error(`unknown genre ${slug}`);
  return found;
}

function movie(
  index: number,
  slug: string,
  title: [string, string],
  durationMin: number,
  rating: MovieRating,
  releaseDate: string,
  status: MovieDetail["status"],
  genreSlugs: string[],
  synopsis: [string, string],
  originalLanguage: string,
): MovieDetail {
  return {
    id: `5a7f6a1e-0c1d-4b8e-9a31-${index.toString().padStart(12, "0")}`,
    slug,
    title: { th: title[0], en: title[1] },
    durationMin,
    rating,
    releaseDate,
    // No posters in the demo: the UI shows its own token-based placeholder.
    posterUrl: null,
    status,
    genres: genreSlugs.map(g),
    synopsis: { th: synopsis[0], en: synopsis[1] },
    originalLanguage,
    backdropUrl: null,
    trailerUrl: null,
  };
}

export const movies: MovieDetail[] = [
  movie(
    0,
    "last-orbit",
    ["วงโคจรสุดท้าย", "The Last Orbit"],
    148,
    "AGE_13",
    "2026-10-09",
    "NOW_SHOWING",
    ["sci-fi", "action"],
    [
      "ลูกเรือสถานีอวกาศต้องตัดสินใจครั้งสำคัญเมื่อเส้นทางกลับโลกถูกปิดลง",
      "A space station crew faces an impossible choice when the way back to Earth closes.",
    ],
    "en",
  ),
  movie(
    1,
    "house-after-rain",
    ["บ้านหลังฝน", "House After the Rain"],
    98,
    "GENERAL",
    "2026-10-15",
    "NOW_SHOWING",
    ["family", "drama"],
    [
      "เด็กหญิงกับคุณยายซ่อมบ้านเก่าริมคลองในหน้าฝนที่ยาวนานที่สุดของปี",
      "A girl and her grandmother repair an old canal-side house in the longest rainy season.",
    ],
    "th",
  ),
  movie(
    2,
    "shadow-of-night",
    ["เงาแห่งรัตติกาล", "Shadow of the Night"],
    126,
    "AGE_18",
    "2026-10-22",
    "NOW_SHOWING",
    ["horror"],
    [
      "ทีมสำรวจพบสิ่งที่ไม่ควรปลุกในโรงพยาบาลร้างกลางกรุงเทพฯ",
      "A survey team wakes something it should not in an abandoned Bangkok hospital.",
    ],
    "th",
  ),
  movie(
    3,
    "noodle-wars",
    ["ศึกก๋วยเตี๋ยวเดือด", "Noodle Wars"],
    112,
    "GENERAL",
    "2026-10-02",
    "NOW_SHOWING",
    ["comedy", "family"],
    [
      "สองร้านก๋วยเตี๋ยวคู่แข่งหน้าปากซอยต้องจับมือกันเมื่อห้างใหญ่จะมาเปิด",
      "Two rival noodle shops at the end of a soi must team up when a mall threatens to move in.",
    ],
    "th",
  ),
  movie(
    4,
    "midnight-in-chiang-mai",
    ["เที่ยงคืนที่เชียงใหม่", "Midnight in Chiang Mai"],
    119,
    "AGE_15",
    "2026-10-16",
    "NOW_SHOWING",
    ["romance", "drama"],
    [
      "นักเขียนหนุ่มพบหญิงปริศนาที่มาตลาดกลางคืนทุกวันศุกร์ และเรื่องราวของเธอเปลี่ยนชีวิตเขา",
      "A young writer meets a stranger at the night market every Friday, and her story changes his life.",
    ],
    "th",
  ),
  movie(
    5,
    "iron-ridge",
    ["สันเขาเหล็กกล้า", "Iron Ridge"],
    134,
    "AGE_15",
    "2026-10-23",
    "NOW_SHOWING",
    ["action"],
    [
      "อดีตทหารพรานนำกลุ่มนักปีนเขาหนีจากแก๊งค้าไม้เถื่อนกลางเทือกเขาตะนาวศรี",
      "A former ranger leads a group of climbers away from timber smugglers in the Tenasserim hills.",
    ],
    "en",
  ),
  movie(
    6,
    "paper-lanterns",
    ["โคมกระดาษ", "Paper Lanterns"],
    104,
    "PROMOTED",
    "2026-12-05",
    "COMING_SOON",
    ["drama", "family"],
    [
      "เรื่องราวของครอบครัวช่างทำโคมในเมืองเก่า ก่อนเทศกาลยี่เป็งที่ทุกอย่างอาจเปลี่ยนไป",
      "A family of lantern makers in an old town, on the eve of a festival that could change everything.",
    ],
    "th",
  ),
  movie(
    7,
    "deep-signal",
    ["สัญญาณใต้ทะเลลึก", "Deep Signal"],
    141,
    "AGE_13",
    "2026-12-19",
    "COMING_SOON",
    ["sci-fi"],
    [
      "นักสมุทรศาสตร์จับสัญญาณประหลาดจากใต้ร่องลึกก้นทะเลอันดามัน",
      "An oceanographer picks up a strange signal from the depths of the Andaman trench.",
    ],
    "en",
  ),
];

export const nowShowing = movies.filter((m) => m.status === "NOW_SHOWING");

export const cinemas: Cinema[] = [
  {
    id: "c1000000-0000-4000-8000-000000000001",
    name: { th: "โรงภาพยนตร์ สยาม", en: "Siam Cinema" },
    address: { th: "ถนนพระราม 1 ปทุมวัน กรุงเทพฯ", en: "Rama I Road, Pathum Wan, Bangkok" },
    city: "Bangkok",
  },
  {
    id: "c1000000-0000-4000-8000-000000000002",
    name: { th: "โรงภาพยนตร์ ลาดพร้าว", en: "Ladprao Cinema" },
    address: { th: "ถนนลาดพร้าว จตุจักร กรุงเทพฯ", en: "Ladprao Road, Chatuchak, Bangkok" },
    city: "Bangkok",
  },
];

export interface HallDef {
  index: number;
  id: string;
  cinemaIndex: number;
  number: number;
  type: "STANDARD" | "IMAX" | "FOUR_DX";
  rows: number;
  cols: number;
  /** Seats before the aisle (an empty grid column follows this many seats). */
  aisleAfter: number;
  /** The last N rows are PREMIUM. */
  premiumRows: number;
  prices: Record<SeatType, number>;
}

export const halls: HallDef[] = [
  {
    index: 0,
    id: "a0000000-0000-4000-8000-000000000001",
    cinemaIndex: 0,
    number: 1,
    type: "STANDARD",
    rows: 8,
    cols: 14,
    aisleAfter: 7,
    premiumRows: 1,
    prices: { STANDARD: 220, PREMIUM: 260 },
  },
  {
    index: 1,
    id: "a0000000-0000-4000-8000-000000000002",
    cinemaIndex: 0,
    number: 2,
    type: "IMAX",
    rows: 10,
    cols: 16,
    aisleAfter: 8,
    premiumRows: 2,
    prices: { STANDARD: 320, PREMIUM: 380 },
  },
  {
    index: 2,
    id: "a0000000-0000-4000-8000-000000000003",
    cinemaIndex: 1,
    number: 1,
    type: "STANDARD",
    rows: 7,
    cols: 12,
    aisleAfter: 6,
    premiumRows: 1,
    prices: { STANDARD: 200, PREMIUM: 240 },
  },
];

export const SLOT_TIMES = ["10:30", "13:00", "15:45", "18:30", "21:15"] as const;
const DAY_MS = 86_400_000;
const EPOCH_2020 = Date.UTC(2020, 0, 1);

/** Bangkok calendar day index (days since 2020-01-01) for a timestamp. */
export function bangkokDayIndex(ms: number): number {
  return Math.floor((ms + 7 * 3_600_000 - EPOCH_2020) / DAY_MS);
}

export function dayIndexToDate(dayIndex: number): string {
  return new Date(EPOCH_2020 + dayIndex * DAY_MS).toISOString().slice(0, 10);
}

export function dateToDayIndex(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - EPOCH_2020) / DAY_MS);
}

export interface ShowtimeKey {
  /** Index into `movies`. */
  movie: number;
  hall: number;
  dayIndex: number;
  slot: number;
}

export interface ShowtimeInfo extends ShowtimeKey {
  id: string;
  startsAt: string;
  startMs: number;
  endMs: number;
  format: ShowtimeFormat;
  hallDef: HallDef;
}

const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");

export function showtimeIdOf(key: ShowtimeKey): string {
  return `5e${hex(key.movie, 2)}${hex(key.hall, 1)}${hex(key.slot, 1)}00-${hex(key.dayIndex, 4)}-4000-8000-000000000000`;
}

export function seatIdOf(showtimeId: string, row: number, col: number): string {
  return `5a${showtimeId.slice(2, 8)}-${showtimeId.slice(9, 13)}-4000-8000-${hex(row, 2)}${hex(col, 2)}00000000`;
}

export function parseShowtimeId(id: string): ShowtimeKey | undefined {
  const m = /^5e([0-9a-f]{2})([0-9a-f])([0-9a-f])00-([0-9a-f]{4})-4000-8000-000000000000$/.exec(id);
  if (!m) return undefined;
  return {
    movie: parseInt(m[1] ?? "", 16),
    hall: parseInt(m[2] ?? "", 16),
    slot: parseInt(m[3] ?? "", 16),
    dayIndex: parseInt(m[4] ?? "", 16),
  };
}

export function showtimeIdOfSeat(seatId: string): string | undefined {
  const m = /^5a([0-9a-f]{6})-([0-9a-f]{4})-4000-8000-[0-9a-f]{4}00000000$/.exec(seatId);
  return m ? `5e${m[1] ?? ""}-${m[2] ?? ""}-4000-8000-000000000000` : undefined;
}

/** Which movie plays in a hall slot on a day: a rotation over the now-showing movies. */
function movieIndexAt(hall: number, slot: number, dayIndex: number): number {
  const rotation = (hall * SLOT_TIMES.length + slot + dayIndex) % nowShowing.length;
  const target = nowShowing[rotation];
  return target ? movies.indexOf(target) : 0;
}

export function resolveShowtime(key: ShowtimeKey): ShowtimeInfo | undefined {
  const hallDef = halls[key.hall];
  const movieDef = movies[key.movie];
  const time = SLOT_TIMES[key.slot];
  if (!hallDef || !movieDef || !time) return undefined;
  if (movieDef.status !== "NOW_SHOWING") return undefined;
  if (movieIndexAt(key.hall, key.slot, key.dayIndex) !== key.movie) return undefined;
  const startsAt = `${dayIndexToDate(key.dayIndex)}T${time}:00+07:00`;
  const startMs = Date.parse(startsAt);
  return {
    ...key,
    id: showtimeIdOf(key),
    startsAt,
    startMs,
    endMs: startMs + movieDef.durationMin * 60_000,
    format: hallDef.type === "IMAX" ? "IMAX" : key.movie % 3 === 0 ? "THREE_D" : "TWO_D",
    hallDef,
  };
}

export function getShowtime(id: string): ShowtimeInfo | undefined {
  const key = parseShowtimeId(id);
  return key ? resolveShowtime(key) : undefined;
}

/** Bookable until 30 minutes after the start. */
export function isBookable(showtime: ShowtimeInfo, now: number): boolean {
  return now < showtime.startMs + 30 * 60_000;
}

export function showtimesOnDay(dayIndex: number, movieIndex?: number): ShowtimeInfo[] {
  const result: ShowtimeInfo[] = [];
  for (const hall of halls) {
    for (let slot = 0; slot < SLOT_TIMES.length; slot++) {
      const m = movieIndexAt(hall.index, slot, dayIndex);
      if (movieIndex !== undefined && m !== movieIndex) continue;
      const info = resolveShowtime({ movie: m, hall: hall.index, dayIndex, slot });
      if (info) result.push(info);
    }
  }
  return result.sort((a, b) => a.startMs - b.startMs);
}

export const SCHEDULE_DAYS = 7;

export interface SeatDef extends Omit<Seat, "status"> {
  priceBaht: number;
}

export function pricesOf(hall: HallDef): Price[] {
  return [
    { seatType: "STANDARD", priceBaht: hall.prices.STANDARD },
    { seatType: "PREMIUM", priceBaht: hall.prices.PREMIUM },
  ];
}

const ROW_LETTERS = "ABCDEFGHIJKLMNOP";

/** Seat layout of a showtime. `gridRow`/`gridCol` are 0-based; the aisle is a missing grid column. */
export function seatLayout(showtime: ShowtimeInfo): SeatDef[] {
  const { hallDef } = showtime;
  const seats: SeatDef[] = [];
  for (let r = 0; r < hallDef.rows; r++) {
    const row = ROW_LETTERS.charAt(r);
    for (let n = 1; n <= hallDef.cols; n++) {
      const type: SeatType = r >= hallDef.rows - hallDef.premiumRows ? "PREMIUM" : "STANDARD";
      seats.push({
        id: seatIdOf(showtime.id, r, n),
        label: `${row}${n.toString()}`,
        row,
        number: n,
        gridRow: r,
        gridCol: n <= hallDef.aisleAfter ? n - 1 : n,
        type,
        priceBaht: hallDef.prices[type],
      });
    }
  }
  return seats;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Murmur3 finalizer: spreads the bits so neighbouring seats look unrelated.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Seats that are already sold when the demo starts (about 15%), stable per seat. */
export function seededStatus(seatId: string): SeatStatus {
  return hashString(seatId) % 100 < 15 ? "BOOKED" : "AVAILABLE";
}
