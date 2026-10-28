import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoviePosterCard } from "./movie-poster-card";

const base = {
  title: "บางกอกหลังเที่ยงคืน",
  subtitle: "Bangkok After Midnight",
  rating: "AGE_15",
  durationMinutes: 118,
  genres: ["ระทึกขวัญ"],
} as const;

describe("MoviePosterCard", () => {
  it("renders a responsive TMDB <img> with dimensions, lazy loading and a meaningful alt", () => {
    render(<MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/p.jpg" />);
    const img = screen.getByRole("img", { name: base.title });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://image.tmdb.org/t/p/w342/p.jpg");
    expect(img.getAttribute("srcset")).toContain("https://image.tmdb.org/t/p/w185/p.jpg 185w");
    expect(img.getAttribute("srcset")).toContain("https://image.tmdb.org/t/p/w780/p.jpg 780w");
    expect(img).toHaveAttribute("sizes");
    expect(img).toHaveAttribute("width", "342");
    expect(img).toHaveAttribute("height", "513");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("loads eagerly for above-the-fold posters", () => {
    render(
      <MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/p.jpg" priority />,
    );
    expect(screen.getByRole("img", { name: base.title })).toHaveAttribute("loading", "eager");
  });

  it("passes non-TMDB URLs through without a srcset", () => {
    render(<MoviePosterCard {...base} posterUrl="https://cdn.example.com/p.jpg" />);
    const img = screen.getByRole("img", { name: base.title });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/p.jpg");
    expect(img).not.toHaveAttribute("srcset");
  });

  it("shows the placeholder (not an <img>) when there is no poster", () => {
    const { container } = render(<MoviePosterCard {...base} posterUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: base.title }).tagName).toBe("DIV");
  });

  it("falls back to the placeholder in the same box when the image fails to load", () => {
    const { container } = render(
      <MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/broken.jpg" />,
    );
    const box = container.querySelector(".aspect-\\[2\\/3\\]");
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    if (img) fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: base.title }).tagName).toBe("DIV");
    // The fixed 2:3 box is still there, so the layout does not shift.
    expect(container.querySelector(".aspect-\\[2\\/3\\]")).toBe(box);
  });

  it("tries again when the poster URL changes after a failure", () => {
    const { container, rerender } = render(
      <MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/broken.jpg" />,
    );
    const img = container.querySelector("img");
    if (img) fireEvent.error(img);
    rerender(<MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/ok.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w342/ok.jpg",
    );
  });

  describe("full-bleed details", () => {
    it("writes title, subtitle and the duration · genres line on the card", () => {
      render(
        <MoviePosterCard
          {...base}
          genres={["ระทึกขวัญ", "ดราม่า"]}
          synopsis="เรื่องย่อ"
          ctaLabel="ดูรอบฉาย"
          posterUrl="https://image.tmdb.org/t/p/w500/p.jpg"
        />,
      );
      expect(screen.getByRole("heading", { name: base.title })).toBeInTheDocument();
      expect(screen.getByText("Bangkok After Midnight")).toBeInTheDocument();
      expect(screen.getByText("1 ชม. 58 นาที · ระทึกขวัญ · ดราม่า")).toBeInTheDocument();
      expect(screen.getByText("เรื่องย่อ")).toBeInTheDocument();
      expect(screen.getByText("ดูรอบฉาย")).toBeInTheDocument();
    });

    it("hides the subtitle when it is the same as the title (ignoring case and spaces)", () => {
      render(<MoviePosterCard {...base} title="Whalefall" subtitle=" whalefall " />);
      expect(screen.getAllByText(/whalefall/i)).toHaveLength(1);
    });

    it("shows at most two genres", () => {
      render(<MoviePosterCard {...base} genres={["A", "B", "C", "D"]} />);
      expect(screen.getByText(/ · A · B$/)).toBeInTheDocument();
      expect(screen.queryByText(/C/)).not.toBeInTheDocument();
    });

    it("shows the release chip only when given (coming soon)", () => {
      const { rerender } = render(<MoviePosterCard {...base} />);
      expect(screen.queryByText("เข้าฉาย 12 พ.ย.")).not.toBeInTheDocument();
      rerender(<MoviePosterCard {...base} releaseLabel="เข้าฉาย 12 พ.ย." />);
      expect(screen.getByText("เข้าฉาย 12 พ.ย.")).toBeInTheDocument();
    });

    it("the title clamps to two lines and the synopsis to three", () => {
      render(<MoviePosterCard {...base} synopsis="ยาวมาก" />);
      expect(screen.getByRole("heading", { name: base.title })).toHaveClass("line-clamp-2");
      expect(screen.getByText("ยาวมาก")).toHaveClass("line-clamp-3");
    });

    it("showDetails={false} leaves only the poster and the rating (movie page hero)", () => {
      render(<MoviePosterCard {...base} showDetails={false} releaseLabel="เข้าฉาย" />);
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.queryByText("เข้าฉาย")).not.toBeInTheDocument();
      expect(screen.getByText("น15+")).toBeInTheDocument();
    });

    it("the placeholder under the overlay does not repeat the title", () => {
      const { container } = render(<MoviePosterCard {...base} posterUrl={null} />);
      expect(container.querySelectorAll("h3")).toHaveLength(1);
      expect(container.querySelector('[role="img"] span')).toBeNull();
    });

    it("keeps the placeholder in the same 2:3 box when an image fails", () => {
      const { container } = render(
        <MoviePosterCard {...base} posterUrl="https://image.tmdb.org/t/p/w500/x.jpg" />,
      );
      const img = container.querySelector("img");
      if (img) fireEvent.error(img);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("article")).toHaveClass("aspect-[2/3]");
      expect(screen.getByRole("heading", { name: base.title })).toBeInTheDocument();
    });
  });
});
