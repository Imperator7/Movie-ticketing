import type {
  CinemaBody,
  GenreBody,
  MovieDetailBody,
  MovieSummaryBody,
  ShowtimeSlotBody,
} from "./catalog.dto.js";

// Row shapes: exactly what the Prisma `select`s in CatalogService return.

export interface GenreRow {
  id: number;
  slug: string;
  nameTh: string;
  nameEn: string;
}

export interface CinemaRow {
  id: string;
  nameTh: string;
  nameEn: string;
  addressTh: string;
  addressEn: string;
  city: string;
}

export interface MovieSummaryRow {
  id: string;
  slug: string;
  titleTh: string;
  titleEn: string;
  synopsisTh: string;
  synopsisEn: string;
  durationMin: number;
  rating: MovieSummaryBody["rating"];
  releaseDate: Date;
  posterUrl: string | null;
  status: MovieSummaryBody["status"];
  genres: { genre: GenreRow }[];
}

export interface MovieDetailRow extends MovieSummaryRow {
  originalLanguage: string;
  backdropUrl: string | null;
  trailerUrl: string | null;
}

export interface ShowtimeSlotRow {
  id: string;
  startsAt: Date;
  format: ShowtimeSlotBody["format"];
  audioLanguage: string;
  subtitleLanguage: string | null;
  hall: { number: number; type: ShowtimeSlotBody["hallType"] };
  prices: { priceBaht: number }[];
}

export const toGenre = (row: GenreRow): GenreBody => ({
  id: row.id,
  slug: row.slug,
  name: { th: row.nameTh, en: row.nameEn },
});

export const toCinema = (row: CinemaRow): CinemaBody => ({
  id: row.id,
  name: { th: row.nameTh, en: row.nameEn },
  address: { th: row.addressTh, en: row.addressEn },
  city: row.city,
});

/** `date` columns arrive as a UTC-midnight Date; the contract wants `YYYY-MM-DD`. */
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

export const toMovieSummary = (row: MovieSummaryRow): MovieSummaryBody => ({
  id: row.id,
  slug: row.slug,
  title: { th: row.titleTh, en: row.titleEn },
  synopsis: { th: row.synopsisTh, en: row.synopsisEn },
  durationMin: row.durationMin,
  rating: row.rating,
  releaseDate: toDateString(row.releaseDate),
  posterUrl: row.posterUrl,
  status: row.status,
  genres: row.genres.map((link) => toGenre(link.genre)),
});

export const toMovieDetail = (row: MovieDetailRow): MovieDetailBody => ({
  ...toMovieSummary(row),
  originalLanguage: row.originalLanguage,
  backdropUrl: row.backdropUrl,
  trailerUrl: row.trailerUrl,
});

/** `fromPriceBaht` is the cheapest seat type (whole baht). A showtime without prices cannot be sold, so 0. */
export const toShowtimeSlot = (row: ShowtimeSlotRow, seatsLeft: number): ShowtimeSlotBody => ({
  id: row.id,
  startsAt: row.startsAt.toISOString(),
  format: row.format,
  audioLanguage: row.audioLanguage,
  subtitleLanguage: row.subtitleLanguage,
  hallNumber: row.hall.number,
  hallType: row.hall.type,
  fromPriceBaht:
    row.prices.length > 0 ? Math.min(...row.prices.map((price) => price.priceBaht)) : 0,
  seatsLeft,
});
