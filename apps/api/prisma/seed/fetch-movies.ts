import { config as loadEnv } from "dotenv";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { moviesFileSchema } from "./schema.js";
import { TmdbClient, fetchSeedMovies } from "./tmdb.js";

// apps/api/.env first, then the repo-root .env (where the TMDB key usually lives). Existing values win.
loadEnv({ quiet: true });
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });

/**
 * `npm run seed:fetch-movies -w api`: snapshots Thailand's now playing + upcoming movies from TMDB into
 * prisma/seed/movies.json (committed). Needs TMDB_API_KEY (v4 read token or v3 key). Nothing is downloaded
 * except JSON; posters stay TMDB URLs. The seed (`npm run seed`) never calls TMDB.
 */
const OUTPUT = fileURLToPath(new URL("./movies.json", import.meta.url));

async function main(): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    process.stderr.write(
      "TMDB_API_KEY is not set. Create a free key at https://www.themoviedb.org/settings/api and add\n" +
        "TMDB_API_KEY=<v4 read access token or v3 API key> to apps/api/.env.\n" +
        "Without a key `npm run seed` still works: it falls back to prisma/seed/movies.sample.json.\n",
    );
    process.exit(1);
  }

  const movies = await fetchSeedMovies(new TmdbClient({ apiKey }));
  const file = moviesFileSchema.parse({ movies });
  const text = await format(JSON.stringify(file), { parser: "json", printWidth: 100 });
  await writeFile(OUTPUT, text);
  process.stdout.write(`Wrote ${String(file.movies.length)} movies to ${OUTPUT}\n`);
}

await main();
