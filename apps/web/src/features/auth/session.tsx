"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { refreshSession } from "@/lib/api-client";
import { selectIsAuthenticated, selectUser, useAuthStore } from "./store";

const SessionReadyContext = createContext(false);

/**
 * Restores the session on page load: the httpOnly refresh cookie is exchanged for an access token
 * (a 401 just means "guest"). Children can render immediately; `useAuth().ready` tells them whether
 * the guest/logged-in answer is final.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void refreshSession().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return <SessionReadyContext.Provider value={ready}>{children}</SessionReadyContext.Provider>;
}

export function useAuth() {
  const ready = useContext(SessionReadyContext);
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return { ready, user, isAuthenticated };
}
