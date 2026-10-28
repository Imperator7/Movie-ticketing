import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeProvider, useTheme } from "./theme-provider";

let prefersDark = false;
const mediaListeners = new Set<() => void>();

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <p data-testid="state">{`${theme}|${resolvedTheme}`}</p>
      {(["light", "dark", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setTheme(t);
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const state = () => screen.getByTestId("state").textContent;
const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  document.documentElement.className = "";
  localStorage.clear();
  prefersDark = false;
  mediaListeners.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    cb();
    return 0;
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return prefersDark;
    },
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("defaults to dark and puts the class on <html>", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(state()).toBe("dark|dark");
    expect(isDark()).toBe(true);
  });

  it("restores a stored choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(state()).toBe("light|light");
    expect(isDark()).toBe(false);
  });

  it("the toggle switches theme, class and storage", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(state()).toBe("light|light");
    expect(isDark()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("system follows the OS and reacts when it changes", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "system" }));
    expect(state()).toBe("system|light");
    expect(isDark()).toBe(false);

    prefersDark = true;
    act(() => {
      mediaListeners.forEach((listener) => {
        listener();
      });
    });
    expect(state()).toBe("system|dark");
    expect(isDark()).toBe(true);
  });

  it("still works when localStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "light" }));
    expect(state()).toBe("light|light");
    vi.restoreAllMocks();
  });
});
