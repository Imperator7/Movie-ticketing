import { defineRouting } from "next-intl/routing";

/** Thai is the default. Routes are always prefixed: /th/... and /en/... (static export). */
export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
