"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { radii, tokenGroups } from "./_data";

export function Section({
  id,
  title,
  notes,
  children,
}: {
  id: string;
  title: string;
  notes: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-border pt-8">
      <header>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{notes}</p>
      </header>
      {children}
    </section>
  );
}

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

const subscribeNothing = () => () => undefined;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the theme on the client, so render the pressed state after hydration.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return (
    <div role="group" aria-label="Theme" className="flex flex-wrap gap-2">
      {THEMES.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant={mounted && theme === value ? "default" : "outline"}
          aria-pressed={mounted && theme === value}
          onClick={() => {
            setTheme(value);
          }}
        >
          <Icon aria-hidden data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  );
}

/** Reads the live computed value of each CSS variable; re-reads when the theme changes. */
function useTokenValues(): Record<string, string> {
  const { resolvedTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    // Wait a tick so the theme class is applied before reading.
    const timer = setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const group of tokenGroups) {
        for (const token of group.tokens) {
          next[token] = style.getPropertyValue(`--${token}`).trim();
        }
      }
      setValues(next);
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, [resolvedTheme]);
  return values;
}

export function ColorTokens() {
  const values = useTokenValues();
  return (
    <div className="flex flex-col gap-6">
      {tokenGroups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-2 text-base font-semibold">{group.title}</h3>
          <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {group.tokens.map((token) => (
              <li
                key={token}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
              >
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: `var(--${token})` }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-medium">--{token}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {values[token] ?? ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const TYPE_SCALE = [
  {
    name: "Display",
    className: "text-4xl font-bold sm:text-5xl",
    th: "จองตั๋วหนังง่าย ๆ ใน 1 นาที",
    en: "Book your seats in a minute",
    heading: true,
  },
  {
    name: "H1",
    className: "text-3xl font-semibold",
    th: "หนังใหม่สัปดาห์นี้",
    en: "New this week",
    heading: true,
  },
  {
    name: "H2",
    className: "text-2xl font-semibold",
    th: "รอบฉายวันนี้",
    en: "Today's showtimes",
    heading: true,
  },
  {
    name: "H3",
    className: "text-xl font-semibold",
    th: "เลือกที่นั่งของคุณ",
    en: "Choose your seats",
    heading: true,
  },
  {
    name: "H4",
    className: "text-lg font-semibold",
    th: "สรุปการจอง",
    en: "Booking summary",
    heading: true,
  },
  {
    name: "Body",
    className: "text-base",
    th: "ที่นั่งจะถูกกันไว้ให้คุณ 5 นาทีเพื่อชำระเงิน",
    en: "Your seats are held for 5 minutes while you pay.",
    heading: false,
  },
  {
    name: "Small",
    className: "text-sm",
    th: "ราคารวมภาษีมูลค่าเพิ่มแล้ว",
    en: "Prices include VAT.",
    heading: false,
  },
  {
    name: "Caption",
    className: "text-xs text-muted-foreground",
    th: "อัปเดตล่าสุดเมื่อสักครู่",
    en: "Updated just now",
    heading: false,
  },
];

export function Typography() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {TYPE_SCALE.map((t) => (
          <li key={t.name} className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:gap-4">
            <span className="font-mono text-xs text-muted-foreground">{t.name}</span>
            <div className={t.heading ? "font-heading" : ""}>
              <p className={t.className}>{t.th}</p>
              <p className={t.className}>{t.en}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-border bg-card p-4 font-mono">
        <span className="text-lg">MT-7KQ2XP</span>
        <span className="text-lg tabular">฿1,250</span>
        <span className="text-lg tabular">4:59</span>
        <span className="w-full text-xs text-muted-foreground">
          Mono (JetBrains Mono): booking codes, prices, countdowns
        </span>
      </div>
    </div>
  );
}

const RADIUS_CLASS: Record<(typeof radii)[number], string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  "4xl": "rounded-4xl",
};

const SHADOWS = [
  ["shadow-xs", "shadow-xs"],
  ["shadow-sm", "shadow-sm"],
  ["shadow-md", "shadow-md"],
  ["shadow-lg", "shadow-lg"],
  ["shadow-xl", "shadow-xl"],
] as const;

const SPACING = [
  ["1", "w-1"],
  ["2", "w-2"],
  ["3", "w-3"],
  ["4", "w-4"],
  ["6", "w-6"],
  ["8", "w-8"],
  ["12", "w-12"],
  ["16", "w-16"],
] as const;

export function Shapes() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-base font-semibold">Radius (base 0.75rem)</h3>
        <ul className="flex flex-wrap gap-3">
          {radii.map((r) => (
            <li key={r} className="flex flex-col items-center gap-1">
              <span className={`size-16 border border-border bg-secondary ${RADIUS_CLASS[r]}`} />
              <span className="font-mono text-xs text-muted-foreground">{r}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold">Spacing (4px unit)</h3>
        <ul className="flex flex-col gap-1.5">
          {SPACING.map(([n, cls]) => (
            <li key={n} className="flex items-center gap-3">
              <span className="w-8 font-mono text-xs text-muted-foreground">{n}</span>
              <span className={`h-3 rounded-sm bg-primary ${cls}`} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold">Elevation</h3>
        <ul className="flex flex-wrap gap-4">
          {SHADOWS.map(([name, cls]) => (
            <li
              key={name}
              className={`flex size-20 items-center justify-center rounded-xl border border-border bg-card font-mono text-[11px] ${cls}`}
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
