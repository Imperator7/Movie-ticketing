import { create } from "zustand";
import type { User } from "@/api/generated/model";

/**
 * Session only (plan §5): the access token and user live in memory and are never persisted.
 * The refresh cookie (httpOnly) restores the session on page load.
 */
export interface AuthState {
  accessToken: string | null;
  user: User | null;
  setSession: (session: { accessToken: string; user: User }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => {
    set({ accessToken, user });
  },
  clear: () => {
    set({ accessToken: null, user: null });
  },
}));

export const selectAccessToken = (state: AuthState) => state.accessToken;
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => state.accessToken !== null;
