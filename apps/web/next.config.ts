import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the app is served from S3 + CloudFront, data comes from the NestJS API.
  // Cache Components / partial prefetching need a server, so they stay off.
  output: "export",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
