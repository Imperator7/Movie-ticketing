import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MovieSummary } from "@/api/generated/model";
import { renderWithIntl } from "@/test/intl";
import { MovieCard, MovieGridSkeleton } from "./movie-card";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof NextIntl>()),
  useLocale: () => "en",
}));

import type * as NextIntl from "next-intl";

const movie: MovieSummary = {
  id: "m1",
  slug: "clayface",
  title: { th: "เคลย์เฟซ", en: "Clayface" },
  durationMin: 109,
  rating: "AGE_15",
  releaseDate: "2026-11-12",
  posterUrl: null,
  status: "NOW_SHOWING",
  genres: [
    { id: 1, slug: "horror", name: { th: "สยองขวัญ", en: "Horror" } },
    { id: 2, slug: "sci-fi", name: { th: "ไซไฟ", en: "Science Fiction" } },
    { id: 3, slug: "thriller", name: { th: "ระทึกขวัญ", en: "Thriller" } },
  ],
};

describe("MovieCard", () => {
  it("is a single link to the movie page named after the title", () => {
    renderWithIntl(<MovieCard movie={movie} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Clayface");
    expect(links[0]).toHaveAttribute("href", "/movie?slug=clayface");
  });

  it("shows the title, the other language as subtitle, and duration · two genres", () => {
    renderWithIntl(<MovieCard movie={movie} />);
    expect(screen.getByRole("heading", { name: "Clayface" })).toBeInTheDocument();
    expect(screen.getByText("เคลย์เฟซ")).toBeInTheDocument();
    expect(screen.getByText("1h 49m · Horror · Science Fiction")).toBeInTheDocument();
  });

  it("now showing: a 'See showtimes' call to action and no release chip", () => {
    renderWithIntl(<MovieCard movie={movie} />);
    expect(screen.getByText("See showtimes")).toBeInTheDocument();
    expect(screen.queryByText(/In cinemas/)).not.toBeInTheDocument();
  });

  it("coming soon: the release date chip and 'View details'", () => {
    renderWithIntl(<MovieCard movie={{ ...movie, status: "COMING_SOON" }} />);
    expect(screen.getByText("In cinemas 12 Nov")).toBeInTheDocument();
    expect(screen.getByText("View details")).toBeInTheDocument();
  });

  it("Thai copy for the chip", () => {
    // useLocale is mocked to "en"; the message file for th is checked through its own keys.
    renderWithIntl(<MovieCard movie={{ ...movie, status: "COMING_SOON" }} />, "th");
    expect(screen.getByText(/^เข้าฉาย /)).toBeInTheDocument();
  });

  it("shows the synopsis for hover/focus when the data has one", () => {
    renderWithIntl(
      <MovieCard movie={{ ...movie, synopsis: { th: "เรื่องย่อ", en: "A short synopsis." } }} />,
    );
    expect(screen.getByText("A short synopsis.")).toHaveClass("line-clamp-3");
  });
});

describe("MovieGridSkeleton", () => {
  it("matches the full-bleed card shape: one 2:3 block per card", () => {
    const { container } = renderWithIntl(<MovieGridSkeleton count={3} />);
    const blocks = container.querySelectorAll(".aspect-\\[2\\/3\\]");
    expect(blocks).toHaveLength(3);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
