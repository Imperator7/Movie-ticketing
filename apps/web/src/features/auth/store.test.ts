import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/api/generated/model";
import { selectAccessToken, selectIsAuthenticated, selectUser, useAuthStore } from "./store";

const user: User = {
  id: "u1",
  displayName: "Somchai",
  preferredLocale: "th",
  loginMethods: ["PASSWORD"],
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it("starts as a guest", () => {
    const state = useAuthStore.getState();
    expect(selectAccessToken(state)).toBeNull();
    expect(selectUser(state)).toBeNull();
    expect(selectIsAuthenticated(state)).toBe(false);
  });

  it("setSession stores the token and user", () => {
    useAuthStore.getState().setSession({ accessToken: "t", user });
    const state = useAuthStore.getState();
    expect(selectAccessToken(state)).toBe("t");
    expect(selectUser(state)).toEqual(user);
    expect(selectIsAuthenticated(state)).toBe(true);
  });

  it("clear resets to a guest", () => {
    useAuthStore.getState().setSession({ accessToken: "t", user });
    useAuthStore.getState().clear();
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(false);
    expect(selectUser(useAuthStore.getState())).toBeNull();
  });

  it("is memory only: nothing is written to web storage", () => {
    useAuthStore.getState().setSession({ accessToken: "secret", user });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
