import type { HallLayoutSpec } from "./layout.js";
import type { HallKind } from "./pricing.js";

export interface HallSeed {
  number: number;
  type: HallKind;
  layout: HallLayoutSpec;
}

export interface CinemaSeed {
  /** Natural key (the table has no unique constraint on it, so the seed looks it up by `nameEn`). */
  nameEn: string;
  nameTh: string;
  addressEn: string;
  addressTh: string;
  city: string;
  halls: HallSeed[];
}

/** Fictional brands, so there is no confusion with real chains. */
export const CINEMAS: readonly CinemaSeed[] = [
  {
    nameEn: "Starlight Cinema Siam Square",
    nameTh: "สตาร์ไลท์ ซีนีม่า สยามสแควร์",
    addressEn: "100 Rama I Road, Pathum Wan, Bangkok 10330",
    addressTh: "100 ถนนพระรามที่ 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330",
    city: "Bangkok",
    halls: [
      {
        number: 1,
        type: "STANDARD",
        layout: {
          rows: 10,
          cols: 16,
          aisleAfter: [4, 12],
          premiumRows: 2,
          inactive: ["A1", "A16"],
        },
      },
      {
        number: 2,
        type: "STANDARD",
        layout: { rows: 8, cols: 12, aisleAfter: [3, 9], premiumRows: 2 },
      },
      {
        number: 3,
        type: "IMAX",
        layout: { rows: 12, cols: 20, aisleAfter: [5, 15], premiumRows: 2, inactive: ["F10"] },
      },
    ],
  },
  {
    nameEn: "Moonrise Cineplex Sukhumvit",
    nameTh: "มูนไรส์ ซีนีเพล็กซ์ สุขุมวิท",
    addressEn: "88 Sukhumvit Road, Khlong Toei, Bangkok 10110",
    addressTh: "88 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
    city: "Bangkok",
    halls: [
      {
        number: 1,
        type: "STANDARD",
        layout: { rows: 10, cols: 16, aisleAfter: [4, 12], premiumRows: 2 },
      },
      {
        number: 2,
        type: "STANDARD",
        layout: { rows: 8, cols: 12, aisleAfter: [3, 9], premiumRows: 2, inactive: ["D6", "D7"] },
      },
      {
        number: 3,
        type: "IMAX",
        layout: { rows: 12, cols: 20, aisleAfter: [5, 15], premiumRows: 2 },
      },
    ],
  },
];
