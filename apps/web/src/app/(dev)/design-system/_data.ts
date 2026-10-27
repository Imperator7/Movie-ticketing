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
      gridRow: r + 1,
      gridCol: number <= AISLE_AFTER ? number : number + 1,
    };
  }),
);

export const demoMovies: {
  id: string;
  title: string;
  subtitle: string;
  posterUrl: string | null;
  rating: ThaiRating;
  durationMinutes: number;
  genres: string[];
}[] = [
  {
    id: "m1",
    title: "เงาแห่งรัตติกาล",
    subtitle: "Shadow of the Night",
    posterUrl: null,
    rating: "AGE_18",
    durationMinutes: 126,
    genres: ["ระทึกขวัญ", "ลึกลับ"],
  },
  {
    id: "m2",
    title: "ดาวเคราะห์สุดท้าย",
    subtitle: "The Last Planet",
    posterUrl: null,
    rating: "AGE_13",
    durationMinutes: 166,
    genres: ["ไซไฟ", "ผจญภัย"],
  },
  {
    id: "m3",
    title: "บ้านหลังฝน",
    subtitle: "House After the Rain",
    posterUrl: null,
    rating: "GENERAL",
    durationMinutes: 98,
    genres: ["ครอบครัว"],
  },
  {
    id: "m4",
    title: "สารคดีป่าฝนไทย",
    subtitle: "Thai Rainforest",
    posterUrl: null,
    rating: "PROMOTED",
    durationMinutes: 75,
    genres: ["สารคดี"],
  },
];

export const demoShowtimes = {
  normal: "2026-11-05T12:30:00Z",
  fewSeats: "2026-11-05T14:00:00Z",
  closed: "2026-11-05T09:00:00Z",
} as const;
