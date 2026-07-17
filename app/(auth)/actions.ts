"use server";

import { headers } from "next/headers";
import { verifyStaffCredentials } from "@/lib/server/auth/credentials";
import { getCaregiverActor, getStaffActor, setPageSessionCookie } from "@/lib/server/auth/dal";
import {
  beginLoginAttempt,
  finishLoginAttempt,
  rateLimiter,
  RATE_LIMITS,
} from "@/lib/server/auth/rate-limit";
import { changeCaregiverPin } from "@/lib/server/caregiver/pin";
import {
  changeStaffPassword,
  findStaffForReset,
  resetStaffPasswordWithToken,
} from "@/lib/server/auth/staff-password";
import { signResetToken } from "@/lib/server/auth/password-reset";
import { email as emailSender } from "@/lib/server/email/mailer";
import { issueSession } from "@/lib/server/auth/sessions";
import {
  changePasswordSchema,
  changePinSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  staffLoginSchema,
} from "@/lib/shared/auth-schemas";

/**
 * Browser sign-in / sign-out (module 09).
 *
 * These exist so the office browser session is **cookie-only**. Signing in
 * through the API handler would hand the page a Bearer access + refresh pair it
 * then had to keep somewhere — and `localStorage` is readable by any XSS on the
 * origin, which is exactly the weakness this module set out to remove. Through
 * this action the browser is issued nothing but the httpOnly cookie: there is no
 * API credential in the page to steal.
 *
 * `/api/v1/auth/staff/login` is unchanged and still returns the Bearer pair —
 * for genuine API clients, which are the only things that should hold one.
 */

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInStaffAction(input: unknown): Promise<SignInResult> {
  const parsed = staffLoginSchema.safeParse(input);
  // Deliberately the same message as a wrong password: a login that says
  // "that's not a valid email" for unknown accounts is a user enumerator.
  if (!parsed.success) return { ok: false, error: "Wrong email or password." };

  // A Server Action is a public HTTP endpoint and needs the same brute-force
  // limits the handler has — and the SAME KEYS, or an attacker just switches
  // seam for a fresh budget.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identityKey = `login:email:${parsed.data.email}`;
  const ipKey = `login:ip:${ip}`;

  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) {
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const staff = await verifyStaffCredentials(parsed.data.email, parsed.data.password);
  await finishLoginAttempt(identityKey, ipKey, staff !== null);
  if (!staff) return { ok: false, error: "Wrong email or password." };

  // The only thing the browser gets. No token reaches the page.
  await setPageSessionCookie({ sub: String(staff.id), st: "staff", role: staff.role });
  return { ok: true };
}

// Sign-out lives in each actor's own group (see app/(office)/actions.ts): the
// boundaries rule forbids components/office importing anything of type `auth`,
// and that wall is worth more than the two lines it costs to keep.

/* ---------------------------------------------- staff: change password */

export type ChangePasswordActionResult = { ok: true } | { ok: false; error: string };

/**
 * Replace an admin-set password with one only she knows (§10.1).
 *
 * Same order, and the same reason, as the caregiver PIN change:
 *   1. `changeStaffPassword` verifies the current password, writes the new
 *      hash, stamps `password_changed_at`, and revokes every refresh token —
 *      killing any session opened with the old password, hers included.
 *   2. we re-issue her cookie immediately.
 * Revoke-then-readmit. Re-admitting only the person who just proved they know
 * the current password is what makes the change mean anything.
 */
export async function changeStaffPasswordAction(
  input: unknown,
): Promise<ChangePasswordActionResult> {
  const staff = await getStaffActor();
  if (!staff) return { ok: false, error: "Sign in again to change your password." };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password." };
  }

  // A wrong current password here is a guess against a live credential —
  // throttled on the same keys as login, so this is not a softer door.
  const identityKey = `login:email:${staff.email}`;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipKey = `login:ip:${ip}`;
  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) {
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const result = await changeStaffPassword(
    staff.staffId,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  await finishLoginAttempt(identityKey, ipKey, result.ok);

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "wrong_password"
          ? "Your current password is wrong."
          : "Sign in again to change your password.",
    };
  }

  // Re-admit her with a cookie issued after `password_changed_at`.
  await setPageSessionCookie({
    sub: String(staff.staffId),
    st: "staff",
    role: staff.role,
  });
  return { ok: true };
}

/* --------------------------------------------- staff: forgot / reset password */

/**
 * Request a reset link (§10.1). ALWAYS returns the same success, whatever the
 * email — unknown, deactivated, throttled, even a send failure. A form that said
 * "no such account" (or failed differently for a real one) is a directory of who
 * works here, and these accounts can read every patient's address. The honest
 * "if that address is registered, check your inbox" belongs on the page, once.
 */
export async function requestStaffPasswordResetAction(input: unknown): Promise<{ ok: true }> {
  const generic = { ok: true } as const;

  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return generic;
  const address = parsed.data.email;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const byEmail = await rateLimiter.check(
    `pwreset:email:${address}`,
    RATE_LIMITS.pwResetPerEmail.limit,
    RATE_LIMITS.pwResetPerEmail.windowMs,
  );
  const byIp = await rateLimiter.check(
    `pwreset:ip:${ip}`,
    RATE_LIMITS.pwResetPerIp.limit,
    RATE_LIMITS.pwResetPerIp.windowMs,
  );
  if (!byEmail.allowed || !byIp.allowed) return generic; // silently drop, never reveal throttling

  const staff = await findStaffForReset(address);
  if (!staff) return generic;

  const token = await signResetToken({ staffId: staff.id, pca: staff.passwordChangedAt });
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const link = `${proto}://${host}/office/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await emailSender.send({
      to: staff.email,
      subject: "Reset your PriyoCare password",
      text:
        `Hello ${staff.name},\n\n` +
        `Someone asked to reset the password for your PriyoCare office account. ` +
        `Open this link to choose a new one — it expires in 30 minutes and can be used once:\n\n` +
        `${link}\n\n` +
        `If this wasn't you, ignore this email; your password stays the same.\n\n— PriyoCare`,
    });
  } catch (err) {
    // Never surface a send failure to the form (it too would leak which
    // addresses exist), but do log it — a silent mail outage is its own bug.
    console.error("Password-reset email failed to send:", err instanceof Error ? err.message : err);
  }

  return generic;
}

export type ResetPasswordActionResult = { ok: true } | { ok: false; error: string };

/**
 * Set a new password from the emailed link. The token is the whole authority —
 * signed, 30-minute, and single-use (it binds to `password_changed_at`, so
 * success invalidates it and every other outstanding link). Every token failure
 * returns one opaque message; only the password-rule messages are specific,
 * because those help the legitimate user without telling an attacker anything.
 */
export async function resetStaffPasswordWithTokenAction(
  input: unknown,
): Promise<ResetPasswordActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const pwIssue = parsed.error.issues.find((i) => i.path[0] === "newPassword");
    return {
      ok: false,
      error: pwIssue?.message ?? "This reset link is invalid or has expired — request a new one.",
    };
  }

  const result = await resetStaffPasswordWithToken(parsed.data.token, parsed.data.newPassword);
  if (!result.ok) {
    return { ok: false, error: "This reset link is invalid or has expired — request a new one." };
  }
  return { ok: true };
}

/* ------------------------------------------------- caregiver: change PIN */

export type ChangePinResult =
  | { ok: true; tokens: { accessToken: string; refreshToken: string } }
  | { ok: false; error: string };

/**
 * Replace the Ops-issued PIN with one only she knows (§12.2).
 *
 * The order here is the whole security property:
 *   1. `changeCaregiverPin` verifies the current PIN, writes the new hash,
 *      stamps `pin_changed_at`, and revokes every refresh token — which kills
 *      any session Ops opened with the initial PIN, and hers along with it.
 *   2. we immediately issue HER a fresh pair and a fresh cookie.
 * Step 2 has to follow step 1, not replace it: revoking everything and then
 * re-admitting only the person who just proved she knows the current PIN is
 * what makes the change mean something.
 */
export async function changeCaregiverPinAction(input: unknown): Promise<ChangePinResult> {
  const caregiver = await getCaregiverActor();
  if (!caregiver) return { ok: false, error: "Sign in again to change your PIN." };

  const parsed = changePinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the PIN." };
  }

  // A wrong current PIN here is a guess against a live credential — throttled
  // on the same keys as login, so this is not a softer door into the same lock.
  const identityKey = `login:caregiver-pin:${caregiver.caregiverId}`;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipKey = `login:ip:${ip}`;
  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) {
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const result = await changeCaregiverPin(
    caregiver.caregiverId,
    parsed.data.currentPin,
    parsed.data.newPin,
  );
  await finishLoginAttempt(identityKey, ipKey, result.ok);

  if (!result.ok) {
    if (result.reason === "wrong_pin") return { ok: false, error: "Your current PIN is wrong." };
    return { ok: false, error: "Sign in again to change your PIN." };
  }

  // Re-admit her: a new cookie (issued after `pin_changed_at`, so the guard
  // accepts it) and a new token pair for the sync layer.
  const session = await issueSession("caregiver", caregiver.caregiverId);
  await setPageSessionCookie({ sub: String(caregiver.caregiverId), st: "caregiver" });

  return {
    ok: true,
    tokens: { accessToken: session.accessToken, refreshToken: session.refreshToken },
  };
}
