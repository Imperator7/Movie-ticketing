import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator.js";
import {
  CinemaDto,
  GenreDto,
  ListMoviesQueryDto,
  MovieDetailDto,
  MoviePageDto,
  MovieShowtimesDto,
  MovieShowtimesQueryDto,
  type CinemaBody,
  type GenreBody,
  type MovieDetailBody,
  type MoviePageBody,
  type MovieShowtimesBody,
} from "./catalog.dto.js";
import { CatalogService } from "./catalog.service.js";

/** Public, read-only catalog (contract tag `Catalog`). */
@Public()
@ApiTags("Catalog")
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("genres")
  @ApiOkResponse({ type: GenreDto, isArray: true })
  listGenres(): Promise<GenreBody[]> {
    return this.catalog.listGenres();
  }

  @Get("cinemas")
  @ApiOkResponse({ type: CinemaDto, isArray: true })
  listCinemas(): Promise<CinemaBody[]> {
    return this.catalog.listCinemas();
  }

  @Get("movies")
  @ApiOkResponse({ type: MoviePageDto })
  listMovies(@Query() query: ListMoviesQueryDto): Promise<MoviePageBody> {
    return this.catalog.listMovies(query);
  }

  @Get("movies/:slug")
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ type: MovieDetailDto })
  getMovie(@Param("slug") slug: string): Promise<MovieDetailBody> {
    return this.catalog.getMovie(slug);
  }

  @Get("movies/:slug/showtimes")
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ type: MovieShowtimesDto })
  listMovieShowtimes(
    @Param("slug") slug: string,
    @Query() query: MovieShowtimesQueryDto,
  ): Promise<MovieShowtimesBody> {
    return this.catalog.listMovieShowtimes(slug, query);
  }
}
