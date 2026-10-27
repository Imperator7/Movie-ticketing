import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as NextIntl from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/intl";
import { LoginForm } from "./login-form";
import { useAuthStore } from "./store";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof NextIntl>()),
  useLocale: () => "en",
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

beforeEach(() => {
  search = "";
  replace.mockReset();
  useAuthStore.getState().clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("validates on the client with translated messages and sends nothing", async () => {
    renderForm();
    await fill("not-an-email", "x");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows INVALID_CREDENTIALS as a form error using the translation, not the API message", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, {
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      }),
    );
    renderForm();
    await fill("demo@example.com", "wrong-password");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    expect(alert).not.toHaveTextContent("Invalid email or password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps server VALIDATION_FAILED details.fields onto the fields", async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {
        statusCode: 422,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: { fields: { email: ["invalid_format"] } },
      }),
    );
    renderForm();
    await fill("a@b.co", "whatever-pw");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.queryByText("Incorrect email or password.")).not.toBeInTheDocument();
  });

  it("logs in and goes to the safe `next` path, keeping ?seats=", async () => {
    search = `next=${encodeURIComponent("/en/showtime?id=abc&seats=A5,A6")}`;
    fetchMock.mockResolvedValueOnce(
      json(200, {
        accessToken: "tok",
        expiresIn: 900,
        user: { id: "u1", displayName: "Demo", preferredLocale: "th", loginMethods: ["PASSWORD"] },
      }),
    );
    renderForm();
    await fill("demo@example.com", "demo-password-123");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/en/showtime?id=abc&seats=A5,A6");
    });
    expect(useAuthStore.getState().accessToken).toBe("tok");
  });

  it("ignores an unsafe `next` (open redirect) and goes to the locale home", async () => {
    search = `next=${encodeURIComponent("//evil.com")}`;
    fetchMock.mockResolvedValueOnce(
      json(200, {
        accessToken: "tok",
        expiresIn: 900,
        user: { id: "u1", displayName: "Demo", preferredLocale: "th", loginMethods: ["PASSWORD"] },
      }),
    );
    renderForm();
    await fill("demo@example.com", "demo-password-123");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/en");
    });
  });
});
