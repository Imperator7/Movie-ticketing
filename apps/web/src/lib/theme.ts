/** Theme logic shared by the provider and the no-flash init script. Dark is the default (a cinema with the lights down). */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME;
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

/**
 * Runs before first paint (server-rendered inline script, see `THEME_INIT_HTML`), so the page
 * never flashes the wrong theme. It must stay in sync with `parseTheme` / `resolveTheme` above.
 * A future CSP must allow this inline script by hash (see docs/security.md, WEB-2).
 */
export const THEME_INIT_SCRIPT = `(function(){var d=true;try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light")d=false;else if(t==="system")d=matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches;}catch(e){}document.documentElement.classList.toggle("dark",d);})();`;

/** The script as HTML markup (what the root layouts put into the server-rendered body). */
export const THEME_INIT_HTML = `<script>${THEME_INIT_SCRIPT}</script>`;
