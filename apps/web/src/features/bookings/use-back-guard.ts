import { useEffect, useRef } from "react";

export type BlockedNavigation = { type: "back" } | { type: "link"; href: string };

/**
 * Blocks leaving the page by the browser back button or by clicking an in-app link, and reports it
 * so the caller can ask "Going back will cancel this booking". (Static export: there is no route
 * middleware, so the guard works on the history stack and on link clicks.)
 *
 * - Back: pushes one sentinel history entry; a `popstate` re-pushes it and reports the attempt.
 * - Links: a capturing click handler stops same-origin link navigation and reports the target.
 */
export function useBackNavigationGuard(
  enabled: boolean,
  onBlocked: (navigation: BlockedNavigation) => void,
): void {
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    onBlockedRef.current = onBlocked;
  });

  useEffect(() => {
    if (!enabled) return;

    window.history.pushState(window.history.state, "", window.location.href);

    const onPopState = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, "", window.location.href);
      onBlockedRef.current({ type: "back" });
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (!anchor || (anchor.getAttribute("target") ?? "_self") !== "_self") return;
      const url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search;
      const there = url.pathname + url.search;
      if (here === there) return;
      event.preventDefault();
      event.stopPropagation();
      onBlockedRef.current({ type: "link", href: there });
    };

    window.addEventListener("popstate", onPopState, { capture: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("popstate", onPopState, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [enabled]);
}
