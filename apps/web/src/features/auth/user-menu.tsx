"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Ticket, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname as useFullPathname } from "next/navigation";
import { logout } from "@/api/generated/endpoints/auth/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "./session";
import { useAuthStore } from "./store";

export function UserMenu() {
  const t = useTranslations("auth");
  const nav = useTranslations("nav");
  const { ready, user, isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fullPath = useFullPathname();

  if (!ready) return <Skeleton className="h-7 w-20" />;

  if (!isAuthenticated || !user) {
    const onAuthPage = /\/(login|register)$/.test(fullPath);
    const href = onAuthPage ? "/login" : `/login?next=${encodeURIComponent(currentUrl(fullPath))}`;
    return (
      <Button asChild size="sm">
        <Link href={href}>{nav("login")}</Link>
      </Button>
    );
  }

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // The session is cleared locally either way.
    }
    useAuthStore.getState().clear();
    queryClient.clear();
    router.push("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-36">
          <UserRound aria-hidden data-icon="inline-start" />
          <span className="truncate">{user.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("account")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/bookings">
            <Ticket aria-hidden />
            {nav("myBookings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void onLogout();
          }}
        >
          <LogOut aria-hidden />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Full URL (with locale and query) of the current page, for `?next=`. */
function currentUrl(fullPath: string): string {
  return typeof window === "undefined"
    ? fullPath
    : window.location.pathname + window.location.search;
}
