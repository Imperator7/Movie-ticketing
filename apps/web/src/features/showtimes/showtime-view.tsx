"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useGetSeatMap, useGetShowtime } from "@/api/generated/endpoints/showtimes/showtimes";
import { useGetActiveBooking } from "@/api/generated/endpoints/bookings/bookings";
import { dataOf } from "@/api/unwrap";
import { PriceSummary } from "@/components/cinema/price-summary";
import { Screen } from "@/components/cinema/screen";
import { SeatLegend } from "@/components/cinema/seat-legend";
import { SeatMap, type SeatMapSeat } from "@/components/cinema/seat-map";
import { PageContainer, QueryError } from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/session";
import { useErrorMessage } from "@/features/auth/use-error-message";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { formatShowDateTime } from "@/lib/format";
import { pickText, toLocale } from "@/lib/localized";
import { MAX_SEATS_PER_BOOKING } from "@/lib/seat";
import { formatSeatList } from "@/lib/seat-list";
import { parseSeatsParam, showtimePath } from "./seat-params";
import { useSeatCopy } from "./seat-labels";
import { useSeatMapRefetchInterval, withoutOwnSeats } from "./seat-cache";
import { useTakenSeatDetector } from "./use-taken-seats";
import { useCreateBookingOptimistic } from "@/features/bookings/use-booking-mutations";

const FLASH_MS = 3_000;
const FORMAT_LABEL = { TWO_D: "2D", THREE_D: "3D", IMAX: "IMAX" } as const;

/** `/showtime?id=&seats=A5,A6`: seat selection with live polling and the "seat just taken" UX (plan §6). */
export function ShowtimeView() {
  const t = useTranslations("showtime");
  const locale = toLocale(useLocale());
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const seatsParam = params.get("seats");
  const { ready, isAuthenticated } = useAuth();

  // Polling pauses while Buy / Cancel is in flight, so a poll can't overwrite the optimistic preview.
  const pollInterval = useSeatMapRefetchInterval();
  const showtimeQuery = useGetShowtime(id, { query: { enabled: id !== "" } });
  const seatMapQuery = useGetSeatMap(id, {
    query: {
      enabled: id !== "",
      refetchInterval: pollInterval,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  });
  const activeQuery = useGetActiveBooking({ query: { enabled: ready && isAuthenticated } });

  const showtime = dataOf(showtimeQuery.data);
  const seatMap = dataOf(seatMapQuery.data);
  const activeResponse = activeQuery.data;
  const activeBooking = activeResponse?.status === 200 ? activeResponse.data : undefined;
  const copy = useSeatCopy(activeBooking !== undefined);

  // ---- selection lives in ?seats= (labels). A local copy makes taps instant and keeps quick
  // successive taps from overwriting each other while router.replace is still in flight.
  const urlLabels = useMemo(() => parseSeatsParam(seatsParam), [seatsParam]);
  const [selectedLabels, setSelectedLabels] = useState(urlLabels);
  const [seenParam, setSeenParam] = useState(seatsParam);
  const [pushedParams, setPushedParams] = useState<string[]>([]);
  if (seatsParam !== seenParam) {
    setSeenParam(seatsParam);
    // Echoes of our own replaces are ignored; anything else (back button, a link) wins.
    const echoed = pushedParams.includes(seatsParam ?? "");
    if (echoed) setPushedParams((prev) => prev.filter((p) => p !== (seatsParam ?? "")));
    else setSelectedLabels(urlLabels);
  }
  const replaceSeats = (labels: readonly string[]) => {
    setSelectedLabels([...labels]);
    setPushedParams((prev) => [...prev, labels.join(",")]);
    router.replace(showtimePath(id, labels), { scroll: false });
  };

  const priceByType = useMemo(
    () => new Map((seatMap?.prices ?? []).map((p) => [p.seatType, p.priceBaht])),
    [seatMap],
  );
  const mapSeats: SeatMapSeat[] = useMemo(
    () =>
      (seatMap?.seats ?? []).map((s) => ({
        id: s.id,
        row: s.row,
        number: s.number,
        type: s.type,
        status: s.status,
        priceBaht: priceByType.get(s.type) ?? 0,
        gridRow: s.gridRow,
        gridCol: s.gridCol,
      })),
    [seatMap, priceByType],
  );
  const seatByLabel = useMemo(
    () => new Map(mapSeats.map((s) => [`${s.row}${s.number}`, s])),
    [mapSeats],
  );
  const labelById = useMemo(
    () => new Map(mapSeats.map((s) => [s.id, `${s.row}${s.number}`])),
    [mapSeats],
  );
  // Only seats that exist on the map count (a hand-edited URL can't select ghosts).
  const validLabels = seatMap ? selectedLabels.filter((l) => seatByLabel.has(l)) : selectedLabels;
  const selectedIds = validLabels.flatMap((l) => seatByLabel.get(l)?.id ?? []);
  const summarySeats = validLabels.flatMap((l) => {
    const seat = seatByLabel.get(l);
    return seat ? [{ id: seat.id, label: l, priceBaht: seat.priceBaht }] : [];
  });

  // ---- "seat just taken": flash, leave the selection and the URL, one toast per refresh
  const [justTaken, setJustTaken] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const handleTaken = (labels: string[], ids?: string[]) => {
    const takenIds = ids ?? labels.flatMap((l) => seatByLabel.get(l)?.id ?? []);
    setJustTaken((prev) => [...new Set([...prev, ...takenIds])]);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setJustTaken([]);
    }, FLASH_MS);
    replaceSeats(selectedLabels.filter((l) => !labels.includes(l)));
    // One apologetic toast per event (not per seat), the same for polling and the SEAT_TAKEN rollback.
    const message = t("seatsTaken", {
      count: labels.length,
      seats: formatSeatList(labels, locale),
    });
    toast.error(message, { description: t("seatsTakenHint") });
    setAnnouncement(`${message} ${t("seatsTakenHint")}`);
  };
  // ---- Buy: an optimistic preview (see useCreateBookingOptimistic), reconciled with the server
  const buy = useCreateBookingOptimistic(id);
  const pendingIds = buy.isPending ? buy.variables.seatIds : [];
  // Our own seats (Buy in flight, or held by our active booking here) are never "just taken".
  const ownLabels = [
    ...pendingIds.flatMap((sid) => labelById.get(sid) ?? []),
    ...(activeBooking?.showtime.id === id ? activeBooking.seats.map((s) => s.label) : []),
  ];
  useTakenSeatDetector(seatMap, withoutOwnSeats(validLabels, ownLabels), (labels) => {
    handleTaken(labels);
  });

  const startBuy = () => {
    setAnnouncement(t("holding"));
    buy.mutate(
      { seatIds: selectedIds, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (response) => {
          const booking = dataOf(response);
          setAnnouncement(t("held"));
          if (booking) router.push(`/checkout?bookingId=${booking.id}`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "SEAT_TAKEN") {
            const takenIds = Array.isArray(error.details?.seatIds)
              ? error.details.seatIds.filter((x): x is string => typeof x === "string")
              : [];
            const labels = takenIds.flatMap((tid) => labelById.get(tid) ?? []);
            handleTaken(labels.length > 0 ? labels : validLabels, takenIds);
            return;
          }
          if (error instanceof ApiError && error.code === "ACTIVE_BOOKING_EXISTS") {
            const bookingId = error.details?.bookingId;
            if (typeof bookingId === "string") {
              router.push(`/checkout?bookingId=${bookingId}`);
              return;
            }
          }
          const message = errorMessage(error);
          toast.error(message);
          setAnnouncement(message);
        },
      },
    );
  };

  const onBuy = () => {
    if (activeBooking) {
      router.push(`/checkout?bookingId=${activeBooking.id}`);
      return;
    }
    if (!isAuthenticated) {
      // Keep the whole URL (with ?seats=) through the login redirect.
      const next = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    startBuy();
  };

  if (id === "" || showtimeQuery.isError) {
    const missing =
      id === "" || (showtimeQuery.error instanceof ApiError && showtimeQuery.error.status === 404);
    return (
      <PageContainer>
        <QueryError
          title={missing ? t("notFound") : t("loadError")}
          error={showtimeQuery.error}
          onRetry={() => void showtimeQuery.refetch()}
        />
      </PageContainer>
    );
  }

  const closed = showtime ? !showtime.isBookable : false;

  return (
    <PageContainer>
      <div className="flex flex-col gap-6 pb-72 lg:pb-0">
        <header className="flex flex-col gap-1">
          {showtime ? (
            <>
              <Link
                href={`/movie?slug=${encodeURIComponent(showtime.movie.slug)}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← {t("changeShowtime")}
              </Link>
              <h1 className="text-2xl font-bold sm:text-3xl">
                {pickText(showtime.movie.title, locale)}
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{pickText(showtime.cinema.name, locale)}</span>
                <span>{t("hall", { number: showtime.hall.number })}</span>
                <span>{formatShowDateTime(showtime.startsAt, locale)}</span>
                <Badge variant="secondary">{FORMAT_LABEL[showtime.format]}</Badge>
              </p>
            </>
          ) : (
            <div aria-busy="true" className="flex flex-col gap-2">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          )}
        </header>

        {closed ? (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            {t("closed")}
          </p>
        ) : null}
        {activeBooking ? (
          <p className="rounded-xl border border-gold/40 bg-card p-4 text-sm">
            {t("activeBooking")}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <section
            aria-label={copy.mapLabel}
            className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4"
          >
            <Screen label={copy.screen} />
            {seatMapQuery.isPending ? <Skeleton aria-busy="true" className="h-64 w-full" /> : null}
            {seatMapQuery.isError && !seatMap ? (
              <QueryError
                title={t("loadError")}
                error={seatMapQuery.error}
                onRetry={() => void seatMapQuery.refetch()}
              />
            ) : null}
            {seatMap ? (
              <SeatMap
                seats={mapSeats}
                selectedIds={selectedIds}
                justTakenIds={justTaken}
                pendingIds={pendingIds}
                disabled={buy.isPending}
                maxSeats={MAX_SEATS_PER_BOOKING}
                labels={copy.seatLabels}
                ariaLabel={copy.mapLabel}
                onSelectionChange={(ids) => {
                  replaceSeats(ids.flatMap((sid) => labelById.get(sid) ?? []));
                }}
                onRejected={(reason) => {
                  if (reason === "limit") {
                    toast.warning(t("limitReached", { max: MAX_SEATS_PER_BOOKING }));
                  }
                }}
              />
            ) : null}
            <SeatLegend labels={copy.legendLabels} />
            <p className="text-center text-xs text-muted-foreground">
              {t("selectHint", { max: MAX_SEATS_PER_BOOKING })}
            </p>
          </section>

          {/* Sticky bottom sheet on mobile, a side panel on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t border-border bg-background/95 p-3 backdrop-blur lg:sticky lg:top-24 lg:z-auto lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <PriceSummary
              seats={summarySeats}
              labels={copy.summaryLabels}
              locale={locale}
              loading={buy.isPending}
              allowEmpty={activeBooking !== undefined}
              disabled={closed && !activeBooking}
              onBuy={onBuy}
            />
          </div>
        </div>

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    </PageContainer>
  );
}
