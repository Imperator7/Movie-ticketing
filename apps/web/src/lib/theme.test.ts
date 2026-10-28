import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTheme, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("parseTheme / resolveTheme", () => {
  it("accepts the three themes and defaults to dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    for (const bad of [null, undefined, "", "blue", "DARK"]) expect(parseTheme(bad)).toBe("dark");
  });

  it("resolves system from the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT (runs before first paint)", () => {
  const run = () => {
    // Executes the exact script that ships in the HTML, as the browser would.
    /* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
    new Function(THEME_INIT_SCRIPT)();
    /* eslint-enable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */
  };
  const isDark = () => document.documentElement.classList.contains("dark");

  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is dark by default (nothing stored)", () => {
    run();
    expect(isDark()).toBe(true);
  });

  it("follows a stored light or dark choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    run();
    expect(isDark()).toBe(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(isDark()).toBe(true);
  });

  it("follows the OS for system", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
    run();
    expect(isDark()).toBe(true);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    run();
    expect(isDark()).toBe(false);
  });

  it("falls back to dark for garbage values and when storage throws", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    run();
    expect(isDark()).toBe(true);
    document.documentElement.className = "";
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    run();
    expect(isDark()).toBe(true);
    vi.restoreAllMocks();
  });

  it("agrees with parseTheme/resolveTheme for every stored value", () => {
    for (const stored of ["light", "dark", "system", "nonsense"]) {
      for (const prefersDark of [true, false]) {
        document.documentElement.className = "";
        localStorage.setItem(THEME_STORAGE_KEY, stored);
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: prefersDark, media: query }));
        run();
        expect(isDark()).toBe(resolveTheme(parseTheme(stored), prefersDark) === "dark");
      }
    }
  });
});
