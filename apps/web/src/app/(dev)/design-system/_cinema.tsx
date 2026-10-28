"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookingBanner } from "@/components/cinema/booking-banner";
import { CountdownChip } from "@/components/cinema/countdown-chip";
import { MoviePosterCard } from "@/components/cinema/movie-poster-card";
import { PriceSummary } from "@/components/cinema/price-summary";
import { RatingBadge, thaiRatings } from "@/components/cinema/rating-badge";
import { Screen } from "@/components/cinema/screen";
import { Seat } from "@/components/cinema/seat";
import { SeatLegend } from "@/components/cinema/seat-legend";
import { SeatMap } from "@/components/cinema/seat-map";
import { ShowtimeChip } from "@/components/cinema/showtime-chip";
import { Button } from "@/components/ui/button";
import { demoMovies, demoSeats, demoShowtimes } from "./_data";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function SeatStates() {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {(
        [
          ["Available", { type: "STANDARD", status: "AVAILABLE" }],
          ["Premium", { type: "PREMIUM", status: "AVAILABLE" }],
          ["Selected", { type: "STANDARD", status: "AVAILABLE", selected: true }],
          ["Held", { type: "STANDARD", status: "HELD" }],
          ["Booked", { type: "STANDARD", status: "BOOKED" }],
          ["Just taken", { type: "STANDARD", status: "BOOKED", justTaken: true }],
        ] as const
      ).map(([name, props]) => (
        <div key={name} className="flex flex-col items-center gap-1">
          <Seat label="A5" priceBaht={220} {...props} />
          <span className="text-xs text-muted-foreground">{name}</span>
        </div>
      ))}
    </div>
  );
}

function InteractiveSeatMap() {
  const [seats, setSeats] = useState(demoSeats);
  const [selected, setSelected] = useState<string[]>(["D5", "D6"]);
  const [justTaken, setJustTaken] = useState<string[]>([]);

  const chosen = seats
    .filter((s) => selected.includes(s.id))
    .map((s) => ({ id: s.id, label: s.id, priceBaht: s.priceBaht }));

  function simulateTaken() {
    const id = selected[0];
    if (!id) return;
    // Mark it BOOKED, drop it from the selection, flash it for ~3 s (plan §6).
    setSeats((prev) => prev.map((s) => (s.id === id ? { ...s, status: "BOOKED" as const } : s)));
    setSelected((prev) => prev.filter((s) => s !== id));
    setJustTaken((prev) => [...prev, id]);
    toast.error(`ที่นั่ง ${id} เพิ่งถูกจองไป`);
    setTimeout(() => {
      setJustTaken((prev) => prev.filter((s) => s !== id));
    }, 3000);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <Screen />
        <SeatMap
          seats={seats}
          selectedIds={selected}
          justTakenIds={justTaken}
          onSelectionChange={setSelected}
          onRejected={(reason) => {
            if (reason === "limit") toast.warning("เลือกได้สูงสุด 4 ที่นั่ง");
          }}
        />
        <SeatLegend />
        <Button
          variant="outline"
          className="self-center"
          disabled={selected.length === 0}
          onClick={simulateTaken}
        >
          Simulate seat taken
        </Button>
      </div>
      <PriceSummary seats={chosen} onBuy={() => toast.success("ไปหน้าชำระเงิน")} />
    </div>
  );
}

export function CinemaShowcase() {
  const [showtime, setShowtime] = useState<string>("normal");
  const [buying, setBuying] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <Group title="Seat states">
        <SeatStates />
      </Group>

      <Group title="Interactive seat map (max 4 seats, try a 5th)">
        <InteractiveSeatMap />
      </Group>

      <Group title="Ratings">
        <div className="flex flex-wrap items-center gap-3">
          {thaiRatings.map((rating) => (
            <RatingBadge key={rating} rating={rating} />
          ))}
        </div>
      </Group>

      <Group title="Showtime chips (normal, few seats left, closed)">
        <div className="flex flex-wrap gap-3">
          <ShowtimeChip
            startsAt={demoShowtimes.normal}
            format="2D"
            seatsLeft={84}
            selected={showtime === "normal"}
            onSelect={() => {
              setShowtime("normal");
            }}
          />
          <ShowtimeChip
            startsAt={demoShowtimes.fewSeats}
            format="IMAX"
            seatsLeft={6}
            selected={showtime === "few"}
            onSelect={() => {
              setShowtime("few");
            }}
          />
          <ShowtimeChip startsAt={demoShowtimes.closed} format="3D" seatsLeft={40} closed />
        </div>
      </Group>

      <Group title="Countdown (4:12, 0:45, 0:00)">
        <div className="flex flex-wrap gap-3">
          <CountdownChip msLeft={252_000} />
          <CountdownChip msLeft={45_000} />
          <CountdownChip msLeft={0} />
        </div>
      </Group>

      <Group title="Booking banner">
        <div className="overflow-hidden rounded-xl border border-border">
          <BookingBanner
            movieTitle="ดาวเคราะห์สุดท้าย"
            seats={["D5", "D6"]}
            msLeft={252_000}
            onContinue={() => toast("ไปหน้าชำระเงิน")}
            onCancel={() => toast("ยกเลิกการจอง")}
            className="static"
          />
        </div>
      </Group>

      <Group title="Movie cards (hover or focus a card to see the synopsis and call to action)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {demoMovies.map(({ id, note, ...movie }) => (
            <div key={id} className="flex flex-col gap-1.5">
              <MoviePosterCard {...movie} priority />
              <p className="text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </Group>

      <Group title="Price summary (empty, with seats, loading)">
        <div className="grid gap-4 md:grid-cols-3">
          <PriceSummary seats={[]} onBuy={() => undefined} />
          <PriceSummary
            seats={[
              { id: "H5", label: "H5", priceBaht: 260 },
              { id: "H6", label: "H6", priceBaht: 260 },
            ]}
            loading={buying}
            onBuy={() => {
              setBuying(true);
              setTimeout(() => {
                setBuying(false);
              }, 1500);
            }}
          />
          <PriceSummary
            seats={[{ id: "A1", label: "A1", priceBaht: 220 }]}
            loading
            onBuy={() => undefined}
          />
        </div>
      </Group>
    </div>
  );
}
