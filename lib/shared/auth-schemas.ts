import { z } from "zod";

/**
 * Auth request schemas (PRD §8, §10). The SAME schemas guard the login forms
 * and the /auth/* route handlers — no drift possible (§10.3).
 */

/** Bangladesh mobile: local `01XXXXXXXXX` or E.164 `+8801XXXXXXXXX`. */
export const bdPhone = z
  .string()
  .trim()
  .regex(
    // local 01XXXXXXXXX, or +880/880/bare, then 1[3-9] + 8 digits
    /^(?:\+?880|0)?1[3-9]\d{8}$/,
    "Enter a valid Bangladeshi mobile number",
  )
  .transform((v) => `+880${v.replace(/^\+?880/, "").replace(/^0/, "")}`);

export const otpRequestSchema = z.object({ phone: bdPhone });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone: bdPhone,
  code: z.string().trim().regex(/^\d{6}$/, "The code is 6 digits"),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

// PIN is the primary caregiver credential (§10.1) — 4–6 digits.
export const caregiverLoginSchema = z.object({
  phone: bdPhone,
  pin: z.string().trim().regex(/^\d{4,6}$/, "PIN is 4–6 digits"),
});
export type CaregiverLoginInput = z.infer<typeof caregiverLoginSchema>;

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

// Refresh token may arrive in the body; the handler also accepts it from a header.
export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});
