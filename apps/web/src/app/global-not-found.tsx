import Link from "next/link";
import { RootDocument } from "@/components/root-document";
import { Button } from "@/components/ui/button";
import { routing } from "@/i18n/routing";

/** Global 404 for URLs outside any locale (the root layout is a pass-through, so it renders its own document). */
export default function GlobalNotFound() {
  return (
    <RootDocument lang={routing.defaultLocale}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="font-mono text-5xl font-bold text-primary">404</p>
        <h1 className="text-2xl font-semibold">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-muted-foreground">Page not found</p>
        <Button asChild>
          <Link href={`/${routing.defaultLocale}`}>กลับหน้าแรก / Home</Link>
        </Button>
      </main>
    </RootDocument>
  );
}
