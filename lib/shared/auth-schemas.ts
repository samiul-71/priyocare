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

/**
 * PINs a caregiver may CHOOSE (§12.2). Ops-issued PINs are random; these are
 * picked by a tired person under mild pressure, so the obvious ones get
 * refused — and only the obvious ones.
 *
 * A 4–6 digit PIN has little entropy either way; what argon2id and the
 * per-identity login limit defend is the whole keyspace. The point of this rule
 * is narrower and worth it: "1234" and "0000" are not a random guess away, they
 * are the FIRST guess. Beyond that, rejecting more just teaches people to write
 * their PIN on the phone case.
 */
const TRIVIAL_PIN = /^(\d)\1*$/; // 0000, 111111 — every digit the same

function isSequential(pin: string): boolean {
  // Zod runs every refinement even when `.regex` above already failed, so this
  // still sees "" and "4" — it must not assume a well-formed PIN.
  if (pin.length < 2) return false;
  const step = (a: string, b: string) => b.charCodeAt(0) - a.charCodeAt(0);
  const first = step(pin[0], pin[1]);
  if (first !== 1 && first !== -1) return false; // 1234… or 4321…
  return [...pin].every((d, i) => i === 0 || step(pin[i - 1], d) === first);
}

export const newPinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, "PIN is 4–6 digits")
  .refine((pin) => !TRIVIAL_PIN.test(pin), "Do not use the same digit repeated")
  .refine((pin) => !isSequential(pin), "Do not use a run like 1234");

/**
 * Self-service reset (§10.1's OTP fallback). The OTP proves she holds the
 * phone; there is no current PIN to prove anything with, which is the point —
 * she forgot it.
 */
export const resetPinWithOtpSchema = z.object({
  phone: bdPhone,
  code: z.string().trim().regex(/^\d{6}$/, "The code is 6 digits"),
  newPin: newPinSchema,
});
export type ResetPinWithOtpInput = z.infer<typeof resetPinWithOtpSchema>;

/** Change PIN (first login, §12.2). The current PIN proves it is her. */
export const changePinSchema = z
  .object({
    currentPin: z.string().trim().regex(/^\d{4,6}$/, "PIN is 4–6 digits"),
    newPin: newPinSchema,
  })
  .refine((v) => v.currentPin !== v.newPin, {
    message: "The new PIN must be different from the current one",
    path: ["newPin"],
  });
export type ChangePinInput = z.infer<typeof changePinSchema>;

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Login stays at the old floor: existing passwords must keep working, and the
  // login screen must not hint at the rules anyway.
  password: z.string().min(8).max(200),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

/**
 * A staff password someone CHOOSES (§10.1). Twelve characters, no composition
 * rules — the NIST line, and the right one: length is what defends a hash,
 * while "one uppercase, one symbol" reliably produces `Password1!` and a
 * sticky note. The only extra check is a short list of the passwords everyone
 * tries first, which are not a guess away — they are the first guess.
 *
 * Staff hold more access than caregivers: every patient address, every
 * caregiver's file. This floor is higher than the 8 login accepts on purpose,
 * and applies going forward.
 */
const OBVIOUS_PASSWORDS = [
  "password",
  "passw0rd",
  "12345678",
  "123456789",
  "qwertyuiop",
  "priyocare",
  "letmein",
  "welcome",
  "admin",
  "changeme",
  "iloveyou",
];

export const newStaffPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters — length is what makes it hard to crack")
  .max(200)
  .refine(
    (pw) => !OBVIOUS_PASSWORDS.some((bad) => pw.toLowerCase().includes(bad)),
    "That contains a password everyone tries first — pick something else",
  );

/** Change your own password. The current one proves the session is yours. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: newStaffPasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    // Names what happened, not a rule: on the forced first change this fires
    // when both boxes hold the sign-in password — a manager that filled both,
    // or the same value typed twice — and "must be different" reads as a demand
    // rather than "these two are identical, and here is which".
    message: "This is the same as your current password — enter a different new one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Refresh token may arrive in the body; the handler also accepts it from a header.
export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});
