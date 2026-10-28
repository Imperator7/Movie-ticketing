import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator.js";
import { ApiErrors } from "../common/errors/api-errors.js";
import { CATALOG_CACHE, CacheControl, SHOWTIMES_CACHE } from "../common/http/cache-control.js";
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
  @CacheControl(CATALOG_CACHE)
  @ApiOkResponse({ type: GenreDto, isArray: true })
  listGenres(): Promise<GenreBody[]> {
    return this.catalog.listGenres();
  }

  @Get("cinemas")
  @CacheControl(CATALOG_CACHE)
  @ApiOkResponse({ type: CinemaDto, isArray: true })
  listCinemas(): Promise<CinemaBody[]> {
    return this.catalog.listCinemas();
  }

  @Get("movies")
  @CacheControl(CATALOG_CACHE)
  @ApiOkResponse({ type: MoviePageDto })
  @ApiErrors(422)
  listMovies(@Query() query: ListMoviesQueryDto): Promise<MoviePageBody> {
    return this.catalog.listMovies(query);
  }

  @Get("movies/:slug")
  @CacheControl(CATALOG_CACHE)
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ type: MovieDetailDto })
  @ApiErrors(404)
  getMovie(@Param("slug") slug: string): Promise<MovieDetailBody> {
    return this.catalog.getMovie(slug);
  }

  @Get("movies/:slug/showtimes")
  @CacheControl(SHOWTIMES_CACHE)
  @ApiParam({ name: "slug", type: String })
  @ApiOkResponse({ type: MovieShowtimesDto })
  @ApiErrors(404, 422)
  listMovieShowtimes(
    @Param("slug") slug: string,
    @Query() query: MovieShowtimesQueryDto,
  ): Promise<MovieShowtimesBody> {
    return this.catalog.listMovieShowtimes(slug, query);
  }
}
