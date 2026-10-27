import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import en from "../../messages/en.json";
import th from "../../messages/th.json";

/** Renders with the real message files (English by default), like the app's locale layout does. */
export function renderWithIntl(ui: ReactElement, locale: "en" | "th" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : th}>
      {ui}
    </NextIntlClientProvider>,
  );
}
