import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Integration tests: need Docker (Testcontainers starts Postgres 17). Run with `npm run test:int -w api`. */
export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite({ module: { type: "es6" } })],
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.int-spec.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // One shared container; specs must not depend on each other's data.
    fileParallelism: false,
  },
});
