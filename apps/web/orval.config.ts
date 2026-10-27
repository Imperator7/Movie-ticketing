import { defineConfig } from "orval";

const input = "../../docs/openapi.yaml";

export default defineConfig({
  // Fetchers, TanStack Query hooks, TS models and MSW handlers (faker mocks).
  api: {
    input,
    output: {
      mode: "tags-split",
      client: "react-query",
      target: "src/api/generated/endpoints",
      schemas: "src/api/generated/model",
      mock: { generators: [{ type: "msw", delay: 150 }] },
      clean: true,
      override: {
        mutator: { path: "src/lib/api-client.ts", name: "apiClient" },
      },
    },
  },
  // Zod schemas for forms and runtime validation.
  zod: {
    input,
    output: {
      mode: "tags-split",
      client: "zod",
      target: "src/api/generated/zod",
      fileExtension: ".zod.ts",
      clean: true,
    },
  },
});
