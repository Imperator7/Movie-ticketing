import { z } from "zod";
import { LoginBody, RegisterBody } from "@/api/generated/zod/auth/auth.zod";

/** Login form: the orval-generated body schema as is (email + password). */
export const loginSchema = LoginBody;
export type LoginValues = z.infer<typeof loginSchema>;

/**
 * Register form: the generated body schema, minus fields the form doesn't ask for (phone, locale
 * come from defaults), plus a confirm-password field checked on the client only.
 */
export const registerSchema = RegisterBody.pick({
  email: true,
  password: true,
  displayName: true,
})
  .extend({ confirmPassword: z.string().min(1) })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "password_mismatch",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

/** Keys of the `auth.validation` messages. */
export type ValidationMessageKey =
  "required" | "email" | "passwordMin" | "tooLong" | "passwordMismatch" | "phone" | "invalid";

/** Picks the message for a field error, from a Zod issue code (client or server side). */
export function validationMessageKey(field: string, code: string): ValidationMessageKey {
  switch (code) {
    case "invalid_format":
      return field === "phone" ? "phone" : "email";
    case "invalid_type":
      return "required";
    case "too_small":
      return field === "password" ? "passwordMin" : "required";
    case "too_big":
      return "tooLong";
    case "custom":
      return field === "confirmPassword" ? "passwordMismatch" : "invalid";
    default:
      return "invalid";
  }
}
