import { describe, expect, it } from "vitest";
import { LoginDto, RegisterDto } from "./auth.dto.js";
import { normalizeEmail } from "./email.js";
import { loginMethods } from "./login-methods.js";

describe("normalizeEmail", () => {
  it.each([
    ["  Alice@Example.COM ", "alice@example.com"],
    ["bob@example.com", "bob@example.com"],
    ["\tCAROL@Example.com\n", "carol@example.com"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it("is idempotent", () => {
    expect(normalizeEmail(normalizeEmail(" A@B.co "))).toBe("a@b.co");
  });
});

describe("request DTO schemas", () => {
  const valid = {
    email: "  Demo@Example.com ",
    password: "long-enough-pw",
    displayName: "  Demo  ",
  };

  it("register normalises the email, trims the name and defaults the locale to th", () => {
    const parsed = RegisterDto.schema.parse(valid);

    expect(parsed).toEqual({
      email: "demo@example.com",
      password: "long-enough-pw",
      displayName: "Demo",
      preferredLocale: "th",
    });
  });

  it.each([
    ["short password", { ...valid, password: "short" }],
    ["password too long", { ...valid, password: "x".repeat(129) }],
    ["bad email", { ...valid, email: "not-an-email" }],
    ["empty name", { ...valid, displayName: "   " }],
    ["bad phone", { ...valid, phone: "12345" }],
    ["bad locale", { ...valid, preferredLocale: "fr" }],
    ["unknown key", { ...valid, isAdmin: true }],
  ])("register rejects %s", (_name, body) => {
    expect(RegisterDto.schema.safeParse(body).success).toBe(false);
  });

  it("register accepts a Thai phone and en locale", () => {
    expect(
      RegisterDto.schema.safeParse({ ...valid, phone: "0812345678", preferredLocale: "en" })
        .success,
    ).toBe(true);
  });

  it("login normalises the email and rejects unknown keys and empty passwords", () => {
    expect(LoginDto.schema.parse({ email: " A@B.co ", password: "x" })).toEqual({
      email: "a@b.co",
      password: "x",
    });
    expect(LoginDto.schema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(LoginDto.schema.safeParse({ email: "a@b.co", password: "x", extra: 1 }).success).toBe(
      false,
    );
  });
});

describe("loginMethods", () => {
  it("is PASSWORD when a password hash is set", () => {
    expect(loginMethods({ passwordHash: "hash" }, [])).toEqual(["PASSWORD"]);
  });

  it("is LINE only for a LINE-only account", () => {
    expect(loginMethods({ passwordHash: null }, [{ provider: "LINE" }])).toEqual(["LINE"]);
  });

  it("lists both for a linked account and never duplicates a provider", () => {
    expect(
      loginMethods({ passwordHash: "h" }, [{ provider: "LINE" }, { provider: "LINE" }]),
    ).toEqual(["PASSWORD", "LINE"]);
  });

  it("is empty when there is neither (the service never creates such a user)", () => {
    expect(loginMethods({ passwordHash: null }, [])).toEqual([]);
  });
});
