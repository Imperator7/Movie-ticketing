import type { Metadata } from "next";
import { CinemaShowcase } from "./_cinema";
import { ColorTokens, Section, Shapes, ThemeToggle, Typography } from "./_foundations";
import { ShadcnShowcase } from "./_shadcn";

export const metadata: Metadata = {
  title: "Design system · Movie Ticketing",
  description: "Review page for the Marquee theme, shadcn components and cinema components",
};

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4">
        <p className="text-sm font-medium tracking-wide text-gold uppercase">Design system</p>
        <h1 className="text-4xl font-bold sm:text-5xl">Marquee</h1>
        <p className="max-w-prose text-muted-foreground">
          ธีมโรงหนัง: โหมดมืดเป็นค่าเริ่มต้น (ห้องฉายปิดไฟ) และโหมดสว่างสำหรับใช้ตอนกลางวัน.
          Dark-first theme for the booking app; every colour below is a semantic token, so
          components never use raw palette colours.
        </p>
        <ThemeToggle />
      </header>

      <Section
        id="colors"
        title="Color tokens"
        notes="Swatches read the live CSS variables, so they update with the theme toggle."
      >
        <ColorTokens />
      </Section>

      <Section
        id="typography"
        title="Typography"
        notes="Prompt for headings, Inter + IBM Plex Sans Thai for body, JetBrains Mono for codes, prices and timers. Thai gets looser line height."
      >
        <Typography />
      </Section>

      <Section
        id="shapes"
        title="Radius, spacing, elevation"
        notes="Radius scales from one --radius token. Prefer the 4px spacing grid and the lighter shadows."
      >
        <Shapes />
      </Section>

      <Section
        id="shadcn"
        title="shadcn components"
        notes="Components from components/ui, themed by the tokens. The xl button is for primary CTAs such as Buy."
      >
        <ShadcnShowcase />
      </Section>

      <Section
        id="cinema"
        title="Cinema components"
        notes="Reusable booking components from components/cinema. Text comes in through props, Thai by default."
      >
        <CinemaShowcase />
      </Section>
    </main>
  );
}
