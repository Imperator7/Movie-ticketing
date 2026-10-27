import { describe, expect, it } from "vitest";
import {
  bangkokDate,
  countdownTone,
  formatBaht,
  formatCountdown,
  formatDuration,
  formatShowDate,
  formatShowDateTime,
  formatShowtime,
} from "./format";

describe("formatBaht", () => {
  it("formats whole baht with the ฿ sign and thousands separators", () => {
    expect(formatBaht(220)).toBe("฿220");
    expect(formatBaht(1250)).toBe("฿1,250");
  });

  it("uses ฿ in English too", () => {
    expect(formatBaht(440, "en")).toBe("฿440");
  });
});

describe("formatCountdown", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatCountdown(5 * 60_000)).toBe("5:00");
    expect(formatCountdown(65_000)).toBe("1:05");
  });

  it("rounds partial seconds up so 0:00 only shows when time is really up", () => {
    expect(formatCountdown(400)).toBe("0:01");
  });

  it("never shows negative time", () => {
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});

describe("countdownTone", () => {
  it("is normal with more than a minute left", () => {
    expect(countdownTone(61_000)).toBe("normal");
  });

  it("warns in the last minute", () => {
    expect(countdownTone(60_000)).toBe("warning");
    expect(countdownTone(1)).toBe("warning");
  });

  it("is expired at zero", () => {
    expect(countdownTone(0)).toBe("expired");
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes in Thai and English", () => {
    expect(formatDuration(166, "th")).toBe("2 ชม. 46 นาที");
    expect(formatDuration(166, "en")).toBe("2h 46m");
  });

  it("omits zero parts", () => {
    expect(formatDuration(120, "en")).toBe("2h");
    expect(formatDuration(45, "th")).toBe("45 นาที");
  });
});

describe("formatShowtime", () => {
  it("shows Bangkok local time whatever the input offset", () => {
    expect(formatShowtime("2026-10-28T12:30:00Z")).toBe("19:30");
  });
});

describe("Bangkok date helpers", () => {
  it("bangkokDate rolls over at midnight Bangkok time, not UTC", () => {
    expect(bangkokDate(Date.UTC(2026, 9, 28, 16, 59))).toBe("2026-10-28");
    expect(bangkokDate(Date.UTC(2026, 9, 28, 17, 0))).toBe("2026-10-29");
  });

  it("formatShowDate shows a short weekday and day in both locales", () => {
    expect(formatShowDate("2026-10-28", "en")).toMatch(/Wed/);
    expect(formatShowDate("2026-10-28", "en")).toMatch(/28/);
    expect(formatShowDate("2026-10-28", "th")).toMatch(/[\u0E00-\u0E7F]/);
  });

  it("formatShowDateTime includes the Bangkok clock time", () => {
    expect(formatShowDateTime("2026-10-28T19:30:00+07:00", "en")).toMatch(/19:30/);
  });
});
