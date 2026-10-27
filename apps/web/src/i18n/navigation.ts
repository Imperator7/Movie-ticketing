import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware Link / useRouter / usePathname (the pathname has no locale prefix). */
export const { Link, useRouter, usePathname } = createNavigation(routing);
