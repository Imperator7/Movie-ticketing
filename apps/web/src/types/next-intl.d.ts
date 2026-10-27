import type { AppLocale } from "@/i18n/routing";
import type messages from "../../messages/th.json";

// Typed messages: `t("unknown.key")` fails typecheck. th.json is the source of truth.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
