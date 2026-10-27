import { cn } from "cn";

export interface ScreenProps {
  label?: string;
  className?: string;
}

/** The curved, softly glowing screen arc shown above the seat map. */
export function Screen({ label = "SCREEN / จอภาพยนตร์", className }: ScreenProps) {
  return (
    <div className={cn("mx-auto w-full max-w-md px-4", className)} data-slot="screen">
      <div
        aria-hidden
        className="h-10 animate-marquee-glow rounded-t-[50%] border-t-4 border-screen bg-linear-to-b from-screen/30 to-transparent shadow-[0_-10px_32px_-6px_var(--screen)]"
      />
      <p className="mt-1 text-center text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
