import { hasLocale, type AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// `requestLocale` is deprecated in favour of next/root-params, which needs every route under [locale];
// the dev pages and `/` live outside it.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  // Use the default export: a module namespace object cannot be passed to Client Components.
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };
  return { locale, messages: messages.default };
});
