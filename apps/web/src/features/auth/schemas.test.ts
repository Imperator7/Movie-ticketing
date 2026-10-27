import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { applyServerFieldErrors, serverFieldIssues } from "./field-errors";
import { loginSchema, registerSchema, validationMessageKey } from "./schemas";

const validRegister = {
  email: "new@example.com",
  password: "long-enough-pw",
  confirmPassword: "long-enough-pw",
  displayName: "Somchai",
};

describe("loginSchema", () => {
  it("accepts an email and a password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["email"]);
  });
});

describe("registerSchema", () => {
  it("accepts valid input", () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it("requires the generated password rules (min 8)", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.error?.issues[0]).toMatchObject({ path: ["password"], code: "too_small" });
  });

  it("flags a confirm password that does not match", () => {
    const result = registerSchema.safeParse({ ...validRegister, confirmPassword: "different-pw" });
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["confirmPassword"], code: "custom" }),
    );
  });

  it("requires a display name", () => {
    const result = registerSchema.safeParse({ ...validRegister, displayName: "" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["displayName"], code: "too_small" });
  });
});

describe("validationMessageKey", () => {
  it.each([
    ["email", "invalid_format", "email"],
    ["phone", "invalid_format", "phone"],
    ["password", "too_small", "passwordMin"],
    ["displayName", "too_small", "required"],
    ["displayName", "too_big", "tooLong"],
    ["confirmPassword", "custom", "passwordMismatch"],
    ["email", "invalid_type", "required"],
    ["email", "weird_code", "invalid"],
  ] as const)("%s + %s -> %s", (field, code, key) => {
    expect(validationMessageKey(field, code)).toBe(key);
  });
});

describe("server validation errors", () => {
  const error = new ApiError({
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Validation failed",
    details: {
      fields: { email: ["invalid_format"], password: ["too_small", "too_big"], _root: ["custom"] },
    },
  });

  it("serverFieldIssues reads details.fields", () => {
    expect(serverFieldIssues(error)).toEqual({
      email: ["invalid_format"],
      password: ["too_small", "too_big"],
      _root: ["custom"],
    });
  });

  it("ignores other errors and malformed details", () => {
    expect(serverFieldIssues(new Error("x"))).toEqual({});
    expect(
      serverFieldIssues(new ApiError({ status: 409, code: "SEAT_TAKEN", message: "x" })),
    ).toEqual({});
    expect(
      serverFieldIssues(
        new ApiError({
          status: 422,
          code: "VALIDATION_FAILED",
          message: "x",
          details: { fields: "oops" },
        }),
      ),
    ).toEqual({});
  });

  it("maps issues onto setError with translated messages, first code per field", () => {
    const setError = vi.fn();
    const applied = applyServerFieldErrors(
      error,
      setError,
      ["email", "password"],
      (field, code) => `${field}:${code}`,
    );
    expect(setError).toHaveBeenCalledWith("email", {
      type: "invalid_format",
      message: "email:invalid_format",
    });
    expect(setError).toHaveBeenCalledWith("password", {
      type: "too_small",
      message: "password:too_small",
    });
    expect(applied).toEqual({ fields: ["email", "password"], unmatched: ["_root"] });
  });
});
