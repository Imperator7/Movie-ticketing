"use client";

import { useEffect, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { useAuth } from "./session";

/**
 * The opposite of `RequireAuth`, for /login and /register: a user who is already logged in (e.g. a second tab,
 * or the back button after logging in) is sent on to `?next=` (WEB-5) or home instead of seeing the form again.
 * The form renders while the session is still restoring, so guests never wait for it.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { ready, isAuthenticated } = useAuth();
  const router = useNextRouter();
  const locale = useLocale();
  const next = useSearchParams().get("next");

  useEffect(() => {
    if (ready && isAuthenticated) router.replace(safeNextPath(next, locale));
  }, [ready, isAuthenticated, router, next, locale]);

  return children;
}
