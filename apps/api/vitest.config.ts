import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // swc emits decorator metadata, which Nest's constructor injection needs (esbuild/oxc do not).
  plugins: [tsconfigPaths(), swc.vite({ module: { type: "es6" } })],
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts"],
  },
});
