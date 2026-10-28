"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** A command in a monospace block with a copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{command}</code>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-label={`Copy ${command}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(command)
            .then(() => {
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/**
 * Wraps the server-rendered report. Passing rows carry `data-status` and are hidden by CSS when the
 * toggle is on (`group-data-[only-failures=true]/report:hidden`), so the page stays server-rendered.
 */
export function FailuresOnly({ children }: { children: ReactNode }) {
  const [only, setOnly] = useState(false);
  return (
    <div data-only-failures={only} className="group/report flex flex-col gap-6">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={only}
          onChange={(event) => {
            setOnly(event.target.checked);
          }}
          className="size-4 accent-primary"
        />
        Show only failures
      </label>
      {children}
    </div>
  );
}
