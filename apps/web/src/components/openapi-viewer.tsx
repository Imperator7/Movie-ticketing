"use client";

import { useEffect, useRef } from "react";
import "swagger-ui-dist/swagger-ui.css";

type Props = {
  spec: Record<string, unknown>;
};

export function OpenApiViewer({ spec }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      // Loaded lazily: swagger-ui is large and only needed on this page.
      const { default: SwaggerUIBundle } = await import("swagger-ui-dist/swagger-ui-es-bundle.js");
      if (cancelled || !containerRef.current) return;
      SwaggerUIBundle({
        spec,
        domNode: containerRef.current,
        deepLinking: true,
        docExpansion: "list",
        defaultModelsExpandDepth: 0,
        // Design review only: there is no API to call yet.
        supportedSubmitMethods: [],
      });
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  // Swagger UI only ships a light theme, so it always sits on a white panel.
  return <div ref={containerRef} className="rounded-xl bg-white text-neutral-900" />;
}
