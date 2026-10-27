import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { formatSeatList } from "@/lib/seat-list";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";

const copy = (locale: "th" | "en", labels: string[]) => {
  const t = createTranslator({
    locale,
    messages: locale === "th" ? th : en,
    namespace: "showtime",
  });
  return {
    title: t("seatsTaken", { count: labels.length, seats: formatSeatList(labels, locale) }),
    hint: t("seatsTakenHint"),
  };
};

describe("seats-taken toast copy", () => {
  it("English, one seat", () => {
    expect(copy("en", ["A5"])).toEqual({
      title: "Sorry, seat A5 was just taken by someone else",
      hint: "We've updated the seat map. Please pick another seat.",
    });
  });

  it("English, several seats are one natural list", () => {
    expect(copy("en", ["A5", "A6"]).title).toBe(
      "Sorry, seats A5 and A6 were just taken by someone else",
    );
    expect(copy("en", ["A5", "A6", "B1"]).title).toBe(
      "Sorry, seats A5, A6 and B1 were just taken by someone else",
    );
  });

  it("Thai, one seat", () => {
    expect(copy("th", ["A5"])).toEqual({
      title: "ขออภัย ที่นั่ง A5 มีผู้จองไปแล้ว",
      hint: "เราอัปเดตผังที่นั่งให้แล้ว กรุณาเลือกที่นั่งใหม่",
    });
  });

  it("Thai, several seats", () => {
    expect(copy("th", ["A5", "A6"]).title).toBe("ขออภัย ที่นั่ง A5 และ A6 มีผู้จองไปแล้ว");
  });
});

describe("formatSeatList", () => {
  it("handles one, two and three labels", () => {
    expect(formatSeatList(["A5"], "en")).toBe("A5");
    expect(formatSeatList(["A5", "A6"], "en")).toBe("A5 and A6");
    expect(formatSeatList(["A5", "A6", "A7"], "th")).toMatch(/^A5.*A6.*A7$/);
  });
});
