import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Inter, JetBrains_Mono, Prompt } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Movie Ticketing",
  description: "Book movie tickets and pay with card or PromptPay",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the theme class before hydration, so the html attributes legitimately differ.
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${plexThai.variable} ${prompt.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
