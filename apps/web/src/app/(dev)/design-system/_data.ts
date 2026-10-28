import type { SeatMapSeat } from "@/components/cinema/seat-map";
import type { ThaiRating } from "@/components/cinema/rating-badge";

/** Semantic tokens from globals.css, grouped as on the review page. */
export const tokenGroups: { title: string; tokens: string[] }[] = [
  {
    title: "Core",
    tokens: [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "border",
      "input",
      "ring",
    ],
  },
  {
    title: "Brand and status",
    tokens: [
      "gold",
      "gold-foreground",
      "success",
      "success-foreground",
      "warning",
      "warning-foreground",
      "info",
      "info-foreground",
    ],
  },
  {
    title: "Seat map",
    tokens: [
      "seat-available",
      "seat-available-hover",
      "seat-premium",
      "seat-premium-hover",
      "seat-selected",
      "seat-selected-foreground",
      "seat-held",
      "seat-booked",
      "seat-taken",
      "screen",
    ],
  },
  {
    title: "Rating",
    tokens: ["rating-general", "rating-13", "rating-15", "rating-18", "rating-20"],
  },
  {
    title: "Chart and sidebar",
    tokens: [
      "chart-1",
      "chart-2",
      "chart-3",
      "chart-4",
      "chart-5",
      "sidebar",
      "sidebar-foreground",
      "sidebar-primary",
      "sidebar-primary-foreground",
      "sidebar-accent",
      "sidebar-accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ],
  },
];

export const radii = ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const;

const ROW_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const COLUMNS = 14;
const AISLE_AFTER = 7;
/** Pre-set non-available seats: [row index, seat number, status]. */
const NON_AVAILABLE: Record<string, "HELD" | "BOOKED"> = {
  C5: "BOOKED",
  C6: "BOOKED",
  D8: "BOOKED",
  D9: "BOOKED",
  E3: "HELD",
  E4: "HELD",
  F10: "BOOKED",
  G7: "HELD",
  H2: "BOOKED",
};

/** 8 rows x 14 seats with a centre aisle; the back row (H) is premium. */
export const demoSeats: SeatMapSeat[] = ROW_LETTERS.flatMap((row, r) =>
  Array.from({ length: COLUMNS }, (_, i) => {
    const number = i + 1;
    const premium = row === "H";
    return {
      id: `${row}${number}`,
      row,
      number,
      type: premium ? ("PREMIUM" as const) : ("STANDARD" as const),
      status: NON_AVAILABLE[`${row}${number}`] ?? ("AVAILABLE" as const),
      priceBaht: premium ? 260 : 220,
      gridRow: r,
      gridCol: number <= AISLE_AFTER ? number - 1 : number,
    };
  }),
);

export const demoMovies: {
  id: string;
  /** What the card demonstrates (shown under it on the review page). */
  note: string;
  title: string;
  subtitle: string;
  posterUrl: string | null;
  rating: ThaiRating;
  durationMinutes: number;
  genres: string[];
  synopsis: string;
  ctaLabel: string;
  releaseLabel?: string;
}[] = [
  {
    id: "m1",
    note: "Now showing, real TMDB poster",
    title: "เคลย์เฟซ",
    subtitle: "Clayface",
    posterUrl: "https://image.tmdb.org/t/p/w500/9l1NuFjel2j89hiuiJbsxfblqjy.jpg",
    rating: "AGE_15",
    durationMinutes: 109,
    genres: ["สยองขวัญ", "ไซไฟ", "ระทึกขวัญ"],
    synopsis:
      "นักแสดงผู้ถูกทำลายใบหน้าค้นพบพลังที่เปลี่ยนร่างกายของเขาให้เป็นดินเหนียว และต้องเลือกระหว่างความแค้นกับความเป็นคน",
    ctaLabel: "ดูรอบฉาย",
  },
  {
    id: "m2",
    note: "Coming soon: release date chip, no poster (placeholder)",
    title: "สัญญาณใต้ทะเลลึก",
    subtitle: "Deep Signal",
    posterUrl: null,
    rating: "AGE_13",
    durationMinutes: 141,
    genres: ["ไซไฟ"],
    synopsis: "นักสมุทรศาสตร์จับสัญญาณประหลาดจากใต้ร่องลึกก้นทะเลอันดามัน",
    ctaLabel: "ดูรายละเอียด",
    releaseLabel: "เข้าฉาย 19 ธ.ค.",
  },
  {
    id: "m3",
    note: "Poster fails to load: falls back to the placeholder",
    title: "บ้านหลังฝน",
    subtitle: "House After the Rain",
    posterUrl: "https://image.tmdb.org/t/p/w500/this-poster-does-not-exist.jpg",
    rating: "GENERAL",
    durationMinutes: 98,
    genres: ["ครอบครัว", "ดราม่า", "ตลก"],
    synopsis: "เด็กหญิงกับคุณยายซ่อมบ้านเก่าริมคลองในหน้าฝนที่ยาวนานที่สุดของปี",
    ctaLabel: "ดูรอบฉาย",
  },
  {
    id: "m4",
    note: "Title equals the subtitle (subtitle hidden), long title clamps to 2 lines",
    title: "Whalefall: ปฏิบัติการใต้ทะเลลึกที่ไม่มีใครเคยเห็นมาก่อนในประวัติศาสตร์",
    subtitle: "Whalefall: ปฏิบัติการใต้ทะเลลึกที่ไม่มีใครเคยเห็นมาก่อนในประวัติศาสตร์",
    posterUrl: null,
    rating: "AGE_18",
    durationMinutes: 106,
    genres: ["ระทึกขวัญ"],
    synopsis: "นักดำน้ำถูกวาฬกลืนลงไปทั้งตัวและมีออกซิเจนเหลือไม่ถึงชั่วโมง",
    ctaLabel: "ดูรอบฉาย",
  },
];

export const demoShowtimes = {
  normal: "2026-11-05T12:30:00Z",
  fewSeats: "2026-11-05T14:00:00Z",
  closed: "2026-11-05T09:00:00Z",
} as const;
