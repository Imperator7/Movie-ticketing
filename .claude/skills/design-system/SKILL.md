---
name: design-system
description: Use before building or changing any UI in apps/web (pages, components, styles, copy layout, dark/light, seat map, movie cards, forms, toasts). The approved "Marquee" design system - tokens, fonts, components, accessibility and Thai typography rules - and when to bring in the impeccable skill. Not needed for API, database or pure logic work.
---

# Marquee design system (approved, decision S7)

The product owner approved this look. Extend it, don't redesign it: a visual change beyond the brief is a product decision, so raise it instead of shipping it.

## Where things are

| What                                            | Where                                                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens (oklch, light + dark)                    | `apps/web/src/app/globals.css`                                                                                                                                                      |
| Fonts                                           | `apps/web/src/lib/fonts.ts`                                                                                                                                                         |
| Cinema components                               | `apps/web/src/components/cinema/` (seat, seat-map, seat-legend, movie-poster-card, rating-badge, countdown-chip, price-summary, booking-banner, showtime-chip, screen, person-icon) |
| shadcn/ui primitives (vendored, nova preset)    | `apps/web/src/components/ui/` - edit only to fix a real bug                                                                                                                         |
| Shell                                           | `apps/web/src/components/shell/` (header, footer, language switcher, theme menu)                                                                                                    |
| Theme provider (in-house, replaced next-themes) | `apps/web/src/components/theme-provider.tsx`, `src/lib/theme.ts`                                                                                                                    |
| Living catalog                                  | `/design-system` dev page (`npm run dev:mock -w web`): every token and component state                                                                                              |

## Rules

1. **Semantic tokens only.** `bg-card`, `text-muted-foreground`, `bg-seat-held`, `bg-scrim`, `text-gold`... Never raw palette classes (`bg-zinc-900`) or hex/oklch literals in components. A new colour = a new token in `globals.css` for light AND dark, plus a swatch on `/design-system`.
2. **Fonts:** headings `font-heading` (Prompt, Thai + Latin), body `font-sans` (Inter for Latin + IBM Plex Sans Thai for Thai glyphs), codes/prices/countdowns `font-mono` (JetBrains Mono). These are approved; ignore generic "don't use Inter" advice (including impeccable's).
3. **Thai first.** Copy comes from `messages/th.json` + `en.json` via next-intl, never hard-coded. Thai runs longer and has tall marks: leave line-height room (no `leading-none` on Thai text), use `text-balance`/`line-clamp-*` instead of fixed heights, test both locales.
4. **Dark is the default theme** (a cinema with the lights down); every change is checked in both themes. Text on posters/images sits on `bg-scrim` + `text-scrim-foreground` (always-dark scrim, AA in both themes).
5. **Seats:** states AVAILABLE / SELECTED / HELD (amber stripes) / BOOKED (grey) / premium; occupied seats (HELD or BOOKED by others) show the filled `PersonIcon` (decision S8). Seat state is never colour-only: icon + `aria-label`.
6. **Accessibility:** real `<button>`/`<a>`, one tab stop per card, visible focus ring (`ring` token), `aria-live` for async changes (seat holds, countdown warnings), respect `prefers-reduced-motion` (`motion-safe:`/`motion-reduce:`), hover-only content must also appear on focus and never hide something touch users need.
7. **Responsive:** check 375px (no horizontal scroll, 2-column poster grid) and desktop. Images: TMDB only (`src/lib/tmdb-image.ts` for `srcset`/`sizes`), `onError` → placeholder in the same box.
8. **Money and time:** `formatBaht` (whole baht, ฿), Bangkok time helpers in `src/lib/format.ts`; never `toLocaleString` ad hoc.

## Checking your work

- Look at it in the browser pane (light + dark, TH + EN, 375px + desktop) and on `/design-system` if you touched a shared component.
- Quick offline anti-pattern scan (no LLM, no network):
  `.claude/skills/impeccable/scripts/impeccable detect apps/web/src/<path>`
  or the running page: `.claude/skills/impeccable/scripts/impeccable detect http://localhost:3000/th` (fuller: it can check contrast and tiny text).
  Treat findings as review input; the rules above win when they conflict.

## When to use the impeccable skill

`impeccable` is installed (`.claude/skills/impeccable`) for **deliberate design work**, not for every UI edit:

- `/impeccable critique <page>` or `audit <page>`: a UX / a11y / responsive review before the lead merges a new screen.
- `/impeccable harden <page>`: error, empty and loading states, long Thai text, overflow.
- `/impeccable polish <component>`: a final pass on a new component.
- `/impeccable clarify`: UX copy. Thai copy changes still need the product owner's OK.

Don't run `init`, `document`, `extract`, `craft`, `bolder`/`quieter`/`colorize`/`overdrive` or `live` unless the product owner asked for a redesign: they rewrite direction or create PRODUCT.md/DESIGN.md. This skill and `globals.css` are the design source of truth.
