import type { ReactNode } from "react";
import { RootDocument } from "@/components/root-document";

/** Document shell for the dev-only pages (/er-diagram, /openapi, /design-system). Not part of production builds. */
export default function DevLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang="th">{children}</RootDocument>;
}
