import { cn } from "cn";

/**
 * A solid person silhouette (round head over rounded shoulders), one colour via `currentColor`.
 * Marks an occupied seat. Decorative: the seat's aria-label already says "booked" / "held".
 */
export function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      data-icon="person"
      className={cn("size-4", className)}
    >
      <circle cx="12" cy="7.5" r="4" />
      <path d="M12 13.5c-4.7 0-8 2.3-8 5.4V21h16v-2.1c0-3.1-3.3-5.4-8-5.4z" />
    </svg>
  );
}
