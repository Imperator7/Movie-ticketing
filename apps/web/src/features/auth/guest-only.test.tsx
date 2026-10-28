import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestOnly } from "./guest-only";

const replace = vi.fn();
let search = "";
let auth = { ready: false, isAuthenticated: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("./session", () => ({ useAuth: () => auth }));

function renderGuestOnly() {
  return render(
    <GuestOnly>
      <p>login form</p>
    </GuestOnly>,
  );
}

describe("GuestOnly", () => {
  beforeEach(() => {
    replace.mockReset();
    search = "";
  });

  it("shows the form while the session is still restoring", () => {
    auth = { ready: false, isAuthenticated: false };
    renderGuestOnly();
    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves guests on the page", () => {
    auth = { ready: true, isAuthenticated: false };
    renderGuestOnly();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a logged-in user to a safe ?next=", () => {
    auth = { ready: true, isAuthenticated: true };
    search = "next=%2Fen%2Fbookings";
    renderGuestOnly();
    expect(replace).toHaveBeenCalledWith("/en/bookings");
  });

  it("sends a logged-in user home when ?next= is unsafe", () => {
    auth = { ready: true, isAuthenticated: true };
    search = "next=https%3A%2F%2Fevil.example";
    renderGuestOnly();
    expect(replace).toHaveBeenCalledWith("/en");
  });
});
