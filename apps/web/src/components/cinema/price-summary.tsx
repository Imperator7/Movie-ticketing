import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatBaht, type Locale } from "@/lib/format";

export interface PriceSummarySeat {
  id: string;
  label: string;
  priceBaht: number;
}

export interface PriceSummaryLabels {
  title: string;
  empty: string;
  total: string;
  buy: string;
  buying: string;
}

export const priceSummaryLabelsTh: PriceSummaryLabels = {
  title: "สรุปการจอง",
  empty: "ยังไม่ได้เลือกที่นั่ง",
  total: "รวมทั้งหมด",
  buy: "ซื้อตั๋ว",
  buying: "กำลังดำเนินการ…",
};

export interface PriceSummaryProps {
  seats: readonly PriceSummarySeat[];
  onBuy: () => void;
  loading?: boolean;
  /** Extra reason to block buying (e.g. booking closed). Buy is always disabled with no seats. */
  disabled?: boolean;
  labels?: PriceSummaryLabels;
  locale?: Locale;
  className?: string;
}

export function PriceSummary({
  seats,
  onBuy,
  loading = false,
  disabled = false,
  labels = priceSummaryLabelsTh,
  locale = "th",
  className,
}: PriceSummaryProps) {
  const total = seats.reduce((sum, seat) => sum + seat.priceBaht, 0);
  return (
    <section
      aria-label={labels.title}
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}
    >
      <h3 className="font-heading text-base font-semibold">{labels.title}</h3>
      {seats.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {seats.map((seat) => (
            <li key={seat.id} className="flex justify-between">
              <span>{seat.label}</span>
              <span className="font-mono tabular">{formatBaht(seat.priceBaht, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">{labels.total}</span>
        <span data-testid="price-total" className="font-mono text-xl font-semibold tabular">
          {formatBaht(total, locale)}
        </span>
      </div>
      <Button
        size="xl"
        className="w-full"
        disabled={seats.length === 0 || disabled || loading}
        onClick={onBuy}
      >
        {loading ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {loading ? labels.buying : labels.buy}
      </Button>
    </section>
  );
}
