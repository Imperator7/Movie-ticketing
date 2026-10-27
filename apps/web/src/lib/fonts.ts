import { IBM_Plex_Sans_Thai, Inter, JetBrains_Mono, Prompt } from "next/font/google";

// Body: Inter for Latin, IBM Plex Sans Thai for Thai glyphs (see --font-sans in globals.css).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
// Headings: Prompt covers Thai and Latin with the same geometric marquee feel.
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});
// Booking codes, countdowns and prices.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const fontVariables = `${inter.variable} ${plexThai.variable} ${prompt.variable} ${jetbrains.variable}`;
