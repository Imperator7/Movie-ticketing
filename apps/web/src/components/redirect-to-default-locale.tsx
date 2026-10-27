"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { routing } from "@/i18n/routing";

const target = `/${routing.defaultLocale}`;

export function RedirectToDefaultLocale() {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router]);
  return (
    <noscript>
      <a href={target}>{target}</a>
    </noscript>
  );
}
