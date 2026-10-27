import type {
  AuthResponse,
  Cinema,
  Genre,
  MovieDetail,
  MovieShowtimes,
  Price,
  Seat,
  SeatMap,
  ShowtimeDetail,
  ShowtimeSlot,
} from "@/api/generated/model";

/** Realistic fixtures for MSW: Thai/English text, whole-baht prices, a seat map with aisles. */

export const genres: Genre[] = [
  { id: 1, slug: "action", name: { th: "แอ็กชัน", en: "Action" } },
  { id: 2, slug: "drama", name: { th: "ดราม่า", en: "Drama" } },
  { id: 3, slug: "sci-fi", name: { th: "ไซไฟ", en: "Sci-Fi" } },
  { id: 4, slug: "family", name: { th: "ครอบครัว", en: "Family" } },
  { id: 5, slug: "horror", name: { th: "สยองขวัญ", en: "Horror" } },
];

const g = (slug: string): Genre => {
  const found = genres.find((x) => x.slug === slug);
  if (!found) throw new Error(`unknown genre ${slug}`);
  return found;
};

const poster = (text: string) =>
  `https://placehold.co/400x600/1f1b2e/f5f5f5/png?text=${encodeURIComponent(text)}`;

export const movies: MovieDetail[] = [
  {
    id: "5a7f6a1e-0c1d-4b8e-9a31-000000000001",
    slug: "dune-part-two",
    title: { th: "ดูน ภาคสอง", en: "Dune: Part Two" },
    durationMin: 166,
    rating: "AGE_13",
    releaseDate: "2026-10-01",
    posterUrl: poster("Dune Part Two"),
    status: "NOW_SHOWING",
    genres: [g("sci-fi"), g("action")],
    synopsis: {
      th: "พอลร่วมมือกับชาวฟรีเมนเพื่อล้างแค้นผู้ที่ทำลายครอบครัวของเขา",
      en: "Paul joins the Fremen to take revenge on those who destroyed his family.",
    },
    originalLanguage: "en",
    backdropUrl: null,
    trailerUrl: null,
  },
  {
    id: "5a7f6a1e-0c1d-4b8e-9a31-000000000002",
    slug: "baan-lang-fon",
    title: { th: "บ้านหลังฝน", en: "House After the Rain" },
    durationMin: 98,
    rating: "GENERAL",
    releaseDate: "2026-10-15",
    posterUrl: poster("House After the Rain"),
    status: "NOW_SHOWING",
    genres: [g("family"), g("drama")],
    synopsis: {
      th: "เด็กหญิงกับคุณยายซ่อมบ้านเก่าริมคลองในหน้าฝนที่ยาวนานที่สุดของปี",
      en: "A girl and her grandmother repair an old canal-side house during the longest rainy season.",
    },
    originalLanguage: "th",
    backdropUrl: null,
    trailerUrl: null,
  },
  {
    id: "5a7f6a1e-0c1d-4b8e-9a31-000000000003",
    slug: "shadow-of-the-night",
    title: { th: "เงาแห่งรัตติกาล", en: "Shadow of the Night" },
    durationMin: 126,
    rating: "AGE_18",
    releaseDate: "2026-10-22",
    posterUrl: poster("Shadow of the Night"),
    status: "NOW_SHOWING",
    genres: [g("horror")],
    synopsis: {
      th: "ทีมสำรวจพบสิ่งที่ไม่ควรปลุกในโรงพยาบาลร้างกลางกรุงเทพฯ",
      en: "A survey team wakes something it should not in an abandoned Bangkok hospital.",
    },
    originalLanguage: "th",
    backdropUrl: null,
    trailerUrl: null,
  },
  {
    id: "5a7f6a1e-0c1d-4b8e-9a31-000000000004",
    slug: "the-last-planet",
    title: { th: "ดาวเคราะห์สุดท้าย", en: "The Last Planet" },
    durationMin: 142,
    rating: "AGE_13",
    releaseDate: "2026-12-12",
    posterUrl: poster("The Last Planet"),
    status: "COMING_SOON",
    genres: [g("sci-fi")],
    synopsis: {
      th: "ลูกเรือกลุ่มสุดท้ายออกตามหาดาวที่มนุษย์ยังอยู่ได้",
      en: "The last crew sets out to find a planet humans can still live on.",
    },
    originalLanguage: "en",
    backdropUrl: null,
    trailerUrl: null,
  },
  {
    id: "5a7f6a1e-0c1d-4b8e-9a31-000000000005",
    slug: "thai-rainforest",
    title: { th: "สารคดีป่าฝนไทย", en: "Thai Rainforest" },
    durationMin: 75,
    rating: "PROMOTED",
    releaseDate: "2026-06-01",
    posterUrl: poster("Thai Rainforest"),
    status: "ENDED",
    genres: [g("family")],
    synopsis: {
      th: "หนึ่งปีในป่าฝนเขาใหญ่ ตั้งแต่ฤดูฝนถึงฤดูแล้ง",
      en: "A year in the Khao Yai rainforest, from monsoon to dry season.",
    },
    originalLanguage: "th",
    backdropUrl: null,
    trailerUrl: null,
  },
];

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

export const prices: Price[] = [
  { seatType: "STANDARD", priceBaht: 220 },
  { seatType: "PREMIUM", priceBaht: 260 },
];

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const COLS = 14;
const AISLE_AFTER = 7;

/** Deterministic non-available seats so the demo looks lived in. */
const BOOKED = new Set(["C5", "C6", "D8", "D9", "F10", "H2"]);
const HELD = new Set(["E3", "E4", "G7"]);

/** Valid-looking UUID that encodes the showtime and the seat position. */
function seatId(showtimeId: string, rowIndex: number, number: number): string {
  const row = rowIndex.toString().padStart(2, "0");
  const col = number.toString().padStart(2, "0");
  return `5ea7${showtimeId.slice(24, 28)}-0000-4000-8000-${row}${col}${showtimeId.slice(28, 36)}`;
}

/** 8 rows x 14 seats, an aisle after column 7 (0-based grid, gaps = aisles), last row premium. */
export function buildSeatMap(showtimeId: string): SeatMap {
  const seats: Seat[] = [];
  for (const [r, row] of ROWS.entries()) {
    for (let number = 1; number <= COLS; number++) {
      const label = `${row}${number.toString()}`;
      seats.push({
        id: seatId(showtimeId, r, number),
        label,
        row,
        number,
        gridRow: r,
        gridCol: number <= AISLE_AFTER ? number - 1 : number,
        type: r === ROWS.length - 1 ? "PREMIUM" : "STANDARD",
        status: BOOKED.has(label) ? "BOOKED" : HELD.has(label) ? "HELD" : "AVAILABLE",
      });
    }
  }
  return {
    showtimeId,
    totalRows: ROWS.length,
    totalCols: COLS + 1,
    seats,
    prices,
    generatedAt: new Date().toISOString(),
  };
}

/** Bangkok-local "YYYY-MM-DD" plus a clock time -> ISO string with the +07:00 offset. */
function bangkokIso(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

export function showtimeId(movieIndex: number, cinemaIndex: number, slot: number): string {
  return `5e000000-0000-4000-8000-${movieIndex.toString().padStart(4, "0")}${cinemaIndex.toString()}${slot.toString().padStart(7, "0")}`;
}

const TIMES = ["10:30", "13:15", "16:00", "19:30", "22:10"];

export function buildMovieShowtimes(movie: MovieDetail, date: string): MovieShowtimes {
  const movieIndex = movies.findIndex((m) => m.id === movie.id);
  const today = new Date();
  const availableDates = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
  });
  return {
    movieId: movie.id,
    date,
    availableDates,
    cinemas: cinemas.map((cinema, cinemaIndex) => ({
      cinema,
      showtimes: TIMES.map<ShowtimeSlot>((time, slot) => ({
        id: showtimeId(movieIndex, cinemaIndex, slot),
        startsAt: bangkokIso(date, time),
        format: slot === 3 && cinemaIndex === 0 ? "IMAX" : "TWO_D",
        audioLanguage: movie.originalLanguage.toUpperCase(),
        subtitleLanguage: movie.originalLanguage === "th" ? null : "TH",
        hallNumber: cinemaIndex + slot + 1,
        hallType: slot === 3 && cinemaIndex === 0 ? "IMAX" : "STANDARD",
        fromPriceBaht: slot === 3 && cinemaIndex === 0 ? 320 : 220,
        seatsLeft: [84, 52, 8, 31, 96][slot] ?? 40,
      })),
    })),
  };
}

export function buildShowtimeDetail(id: string): ShowtimeDetail | undefined {
  const movieIndex = Number(id.slice(24, 28));
  const cinemaIndex = Number(id.slice(28, 29));
  const slot = Number(id.slice(29));
  const movie = movies[movieIndex];
  const cinema = cinemas[cinemaIndex];
  const time = TIMES[slot];
  if (!movie || !cinema || !time) return undefined;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const startsAt = bangkokIso(date, time);
  const startMs = new Date(startsAt).getTime();
  return {
    id,
    movie,
    cinema,
    hall: {
      id: `a0000000-0000-4000-8000-${id.slice(24, 36)}`,
      number: cinemaIndex + slot + 1,
      type: "STANDARD",
    },
    startsAt,
    endsAt: new Date(startMs + movie.durationMin * 60_000).toISOString(),
    format: "TWO_D",
    audioLanguage: movie.originalLanguage.toUpperCase(),
    subtitleLanguage: movie.originalLanguage === "th" ? null : "TH",
    prices,
    bookingClosesAt: new Date(startMs + 30 * 60_000).toISOString(),
    isBookable: Date.now() < startMs + 30 * 60_000,
    maxSeatsPerBooking: 4,
  };
}

export const demoUser: AuthResponse["user"] = {
  id: "u0000000-0000-4000-8000-000000000001",
  email: "somchai@example.com",
  displayName: "สมชาย ใจดี",
  avatarUrl: null,
  phone: "0812345678",
  preferredLocale: "th",
  loginMethods: ["PASSWORD"],
};
