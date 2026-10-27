import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Dev-only pages (/er-diagram, /openapi, /design-system) are named `page.dev.tsx`. Next only treats
// them as routes when the `dev.tsx` page extension is enabled, which `npm run dev` does via
// INCLUDE_DEV_PAGES=1. Production builds never include them (security WEB-1).
const includeDevPages = process.env.INCLUDE_DEV_PAGES === "1";

const nextConfig: NextConfig = {
  // Static export: the app is served from S3 + CloudFront, data comes from the NestJS API.
  // Cache Components / partial prefetching need a server, so they stay off.
  output: "export",
  // Several root layouts (no app/layout.tsx), so the 404 for unknown URLs is global-not-found.tsx.
  experimental: { globalNotFound: true },
  pageExtensions: includeDevPages ? ["tsx", "ts", "dev.tsx"] : ["tsx", "ts"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
