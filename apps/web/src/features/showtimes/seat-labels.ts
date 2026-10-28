import { useTranslations } from "next-intl";
import type { SeatLabels } from "@/components/cinema/labels";
import type { PriceSummaryLabels } from "@/components/cinema/price-summary";
import type { SeatLegendLabels } from "@/components/cinema/seat-legend";

/** Seat, legend and price-summary copy from the message files (the cinema components take it as props). */
export function useSeatCopy(continueBooking: boolean) {
  const seat = useTranslations("seat");
  const summary = useTranslations("summary");

  const seatLabels: SeatLabels = {
    type: { STANDARD: seat("standard"), PREMIUM: seat("premium") },
    status: { AVAILABLE: seat("available"), HELD: seat("held"), BOOKED: seat("booked") },
    selected: seat("selected"),
    seatName: (row, number) => seat("rowSeat", { row, number }),
    announce: {
      selected: (name, count, max) => seat("announceSelected", { seat: name, count, max }),
      deselected: (name, count) => seat("announceDeselected", { seat: name, count }),
      limit: (max) => seat("announceLimit", { max }),
    },
    zoom: {
      label: seat("zoomLabel"),
      in: seat("zoomIn"),
      out: seat("zoomOut"),
      reset: seat("zoomReset"),
    },
    keyboardHint: seat("keyboardHint"),
  };
  const legendLabels: SeatLegendLabels = {
    available: seat("available"),
    premium: seat("premium"),
    selected: seat("legendSelected"),
    held: seat("held"),
    booked: seat("booked"),
  };
  const summaryLabels: PriceSummaryLabels = {
    title: summary("title"),
    empty: summary("empty"),
    total: summary("total"),
    buy: continueBooking ? summary("continueBooking") : summary("buy"),
    buying: summary("buying"),
  };
  return {
    seatLabels,
    legendLabels,
    summaryLabels,
    mapLabel: seat("mapLabel"),
    screen: seat("screen"),
  };
}
