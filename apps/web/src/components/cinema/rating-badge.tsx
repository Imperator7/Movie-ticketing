import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Thai film rating system. Mirrors the API `MovieRating` enum. */
export type ThaiRating = "PROMOTED" | "GENERAL" | "AGE_13" | "AGE_15" | "AGE_18" | "AGE_20";

export const thaiRatings: readonly ThaiRating[] = [
  "PROMOTED",
  "GENERAL",
  "AGE_13",
  "AGE_15",
  "AGE_18",
  "AGE_20",
];

export const thaiRatingLabels: Record<ThaiRating, string> = {
  PROMOTED: "ส",
  GENERAL: "ท",
  AGE_13: "น13+",
  AGE_15: "น15+",
  AGE_18: "น18+",
  AGE_20: "ฉ20-",
};

export const thaiRatingMeanings: Record<ThaiRating, string> = {
  PROMOTED: "Promoted for educational value",
  GENERAL: "General audiences",
  AGE_13: "Suitable for ages 13 and over",
  AGE_15: "Suitable for ages 15 and over",
  AGE_18: "Suitable for ages 18 and over",
  AGE_20: "Restricted to ages 20 and over",
};

const generalStyle = "border-rating-general text-rating-general bg-rating-general/15";
const ratingStyles: Record<ThaiRating, string> = {
  PROMOTED: generalStyle,
  GENERAL: generalStyle,
  AGE_13: "border-rating-13 text-rating-13 bg-rating-13/15",
  AGE_15: "border-rating-15 text-rating-15 bg-rating-15/15",
  AGE_18: "border-rating-18 text-rating-18 bg-rating-18/15",
  AGE_20: "border-rating-20 text-rating-20 bg-rating-20/15",
};

export interface RatingBadgeProps {
  rating: ThaiRating;
  /** Tooltip text; defaults to the English meaning. */
  meaning?: string;
  className?: string;
}

export function RatingBadge({
  rating,
  meaning = thaiRatingMeanings[rating],
  className,
}: RatingBadgeProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            data-rating={rating}
            aria-label={`${thaiRatingLabels[rating]} (${meaning})`}
            className={cn(
              "inline-flex h-5 items-center rounded-md border px-1.5 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              ratingStyles[rating],
              className,
            )}
          >
            {thaiRatingLabels[rating]}
          </span>
        </TooltipTrigger>
        <TooltipContent>{meaning}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
