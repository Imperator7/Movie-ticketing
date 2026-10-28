"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DARK_MEDIA_QUERY,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  parseTheme,
  resolveTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

/**
 * Light / dark / system theme. An in-house replacement for next-themes: that library renders its
 * no-flash `<script>` from a client component, which React 19.2 reports as an error whenever the
 * layout re-renders on the client (e.g. switching language). Here the script is rendered on the
 * server by the root layouts (see `ThemeScript`), and this provider only manages state.
 */

const listeners = new Set<() => void>();
const notify = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) listener();
  };
  media.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Only used when localStorage is blocked, so the toggle still works until reload. */
let memoryTheme: Theme = DEFAULT_THEME;

function readStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return memoryTheme;
  }
}

/** One string snapshot ("theme|resolved") keeps useSyncExternalStore stable between renders. */
function getSnapshot(): string {
  const theme = readStoredTheme();
  return `${theme}|${resolveTheme(theme, window.matchMedia(DARK_MEDIA_QUERY).matches)}`;
}
const getServerSnapshot = () => `${DEFAULT_THEME}|dark`;

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: "dark",
  setTheme: () => undefined,
});

/** Switches the class without animating every element (avoids a flash of half-transitioned colours). */
function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (root.classList.contains("dark") === (resolved === "dark")) return;
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(style);
  root.classList.toggle("dark", resolved === "dark");
  // Force a style recalculation, then drop the override on the next frame.
  window.getComputedStyle(root).getPropertyValue("opacity");
  requestAnimationFrame(() => {
    style.remove();
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [themeText = DEFAULT_THEME, resolvedText = "dark"] = snapshot.split("|");
  const theme = parseTheme(themeText);
  const resolvedTheme: ResolvedTheme = resolvedText === "light" ? "light" : "dark";

  useEffect(() => {
    applyClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    memoryTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload (kept in memoryTheme).
    }
    notify();
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
