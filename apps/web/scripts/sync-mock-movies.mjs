// Regenerates src/mocks/movies.fixture.json from the API seed's movies file, so the demo mocks and the
// database show the same movies. Run: npm run mocks:sync-movies -w web
// (Node 24 strips the types of map-movies.ts, so the mapping is shared with its unit tests.)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mapMovies } from "../src/mocks/map-movies.ts";

const seedDir = path.join(import.meta.dirname, "..", "..", "api", "prisma", "seed");
const source = ["movies.json", "movies.sample.json"]
  .map((name) => path.join(seedDir, name))
  .find((file) => existsSync(file));
if (!source) {
  console.error(`No movies.json or movies.sample.json in ${seedDir}`);
  process.exit(1);
}

const fixture = mapMovies(JSON.parse(readFileSync(source, "utf8")));
const target = path.join(import.meta.dirname, "..", "src", "mocks", "movies.fixture.json");
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `mocks:sync-movies: ${fixture.movies.length.toString()} movies from ${path.basename(source)} -> ${path.relative(process.cwd(), target)}`,
);
