"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { login } from "@/api/generated/endpoints/auth/auth";
import { dataOf } from "@/api/unwrap";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { getShowtime, seatLayout } from "./catalog";
import type { PayOutcome } from "./db";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  demoFastForward,
  demoReset,
  demoSetOutcome,
  demoTakeSeats,
  getOutcome,
} from "./demo";

const OUTCOMES: { value: PayOutcome; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "decline", label: "Card declined" },
  { value: "late", label: "Late payment (refunded)" },
];

/**
 * Floating panel to try every UX state. Development with NEXT_PUBLIC_API_MOCKING=enabled only
 * (it is dynamically imported behind a build-time constant, so production builds never include it).
 * Dev tooling: its copy is intentionally English-only.
 */
export default function DemoControls() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<PayOutcome>(getOutcome);

  const refresh = () => queryClient.invalidateQueries();

  const takeMySeat = () => {
    const params = new URLSearchParams(window.location.search);
    const showtime = getShowtime(params.get("id") ?? "");
    const labels = (params.get("seats") ?? "").split(",").filter(Boolean);
    if (!showtime || labels.length === 0) {
      toast.info("Open a seat selection page and pick a seat first.");
      return;
    }
    const layout = seatLayout(showtime);
    const first = labels
      .map((label) => layout.find((s) => s.label === label))
      .find((s) => s !== undefined);
    if (!first) return;
    demoTakeSeats([first.id]);
    toast.success(`Someone just bought ${first.label}. The next seat-map refresh will show it.`);
    void refresh();
  };

  const fastForward = () => {
    if (demoFastForward(10_000)) {
      toast.success("Payment window set to 0:10.");
      void refresh();
    } else {
      toast.info("No booking in progress.");
    }
  };

  const loginDemo = async () => {
    try {
      const session = dataOf(await login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }));
      if (session) useAuthStore.getState().setSession(session);
      toast.success(`Logged in as ${DEMO_EMAIL}`);
      void refresh();
    } catch {
      toast.error("Login failed");
    }
  };

  const reset = () => {
    demoReset();
    useAuthStore.getState().clear();
    queryClient.clear();
    router.push("/");
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label="Open demo controls"
        className="fixed bottom-2 left-14 z-50 shadow-lg lg:bottom-4"
        onClick={() => {
          setOpen(true);
        }}
      >
        <FlaskConical aria-hidden data-icon="inline-start" />
        Demo
      </Button>
    );
  }

  return (
    <aside
      aria-label="Demo controls"
      className="fixed top-1/2 left-2 z-50 flex w-64 -translate-y-1/2 flex-col gap-2 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl lg:top-auto lg:bottom-4 lg:left-16 lg:translate-y-0"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-heading font-semibold">
          <FlaskConical aria-hidden className="size-4" />
          Demo controls
        </h2>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Close demo controls"
          onClick={() => {
            setOpen(false);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void loginDemo()}>
        Log in as demo user
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={takeMySeat}>
        Someone takes my selected seat
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={fastForward}>
        Fast-forward payment to 0:10
      </Button>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Payment outcome</span>
        <select
          value={outcome}
          className="h-8 rounded-lg border border-input bg-background px-2"
          onChange={(event) => {
            const next = OUTCOMES.find((o) => o.value === event.target.value)?.value ?? "success";
            setOutcome(next);
            demoSetOutcome(next);
          }}
        >
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" size="sm" variant="destructive" onClick={reset}>
        Reset demo state
      </Button>
    </aside>
  );
}
