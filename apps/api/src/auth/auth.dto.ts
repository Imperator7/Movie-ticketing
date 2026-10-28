import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { createStrictDto } from "../common/validation/strict-dto.js";
import { normalizeEmail } from "./email.js";

// Normalised (trimmed, lowercased) before validation; `.meta` keeps the documented schema `format: email`.
const email = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.email())
  .meta({ format: "email" });
const locale = z.enum(["th", "en"]);

export class RegisterDto extends createStrictDto({
  email,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .regex(/^0[0-9]{8,9}$/)
    .optional(),
  preferredLocale: locale.default("th"),
}) {}

export class LoginDto extends createStrictDto({
  email,
  // Bounded so a huge body cannot be used to burn hashing time.
  password: z.string().min(1).max(256),
}) {}

const userSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable().optional(),
  displayName: z.string(),
  avatarUrl: z.url().nullable().optional(),
  // Plain nullable strings are mis-rendered as arrays by nestjs-zod on top-level DTO properties; the override pins them.
  phone: z.string().nullable().optional().meta({ type: "string", nullable: true }),
  preferredLocale: locale,
  loginMethods: z.array(z.enum(["PASSWORD", "LINE"])),
});

/** Response schema, documented in Swagger (responses are not re-validated at runtime). */
export class UserDto extends createZodDto(userSchema) {}

export class AuthResponseDto extends createZodDto(
  z.object({
    accessToken: z.string(),
    expiresIn: z.number().int(),
    user: userSchema,
  }),
) {}

export type UserBody = z.infer<typeof userSchema>;
export type AuthResponseBody = z.infer<typeof AuthResponseDto.schema>;
