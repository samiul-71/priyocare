import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { staffAccounts } from "../db/schema";
import { generatePassword, hashPassword, verifyPassword } from "./password";
import { revokeAllForSubject } from "./sessions";
import { verifyResetToken } from "./password-reset";

/**
 * Staff password change / reset (§10.1).
 *
 * The same shape as the caregiver PIN (lib/server/caregiver/pin.ts), and that
 * symmetry is the point: staff had NONE of it — passwords were set once by
 * `db:create-staff` and never changed. No forced first change, no rotation, no
 * reset. A caregiver had a forced change and two reset routes, while the people
 * who can read every patient's address and every caregiver's file had nothing.
 *
 * Revocation works the same way and for the same reason. A change must end what
 * the old password opened, or it is theatre:
 *   - refresh tokens are rows → revoked outright
 *   - the page cookie is a stateless JWT → `password_changed_at` is stamped and
 *     the guard refuses any session whose `iat` precedes it
 */

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "wrong_password" };

/** Change your own password. The current one proves the session is yours. */
export async function changeStaffPassword(
  staffId: number,
  currentPassword: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<ChangePasswordResult> {
  const db = getDb();

  const [staff] = await db
    .select({ id: staffAccounts.id, passwordHash: staffAccounts.passwordHash })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, staffId))
    .limit(1);

  if (!staff) return { ok: false, reason: "not_found" };
  if (!(await verifyPassword(staff.passwordHash, currentPassword))) {
    return { ok: false, reason: "wrong_password" };
  }

  await db
    .update(staffAccounts)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordMustChange: false,
      passwordChangedAt: now,
    })
    .where(eq(staffAccounts.id, staffId));

  await revokeAllForSubject("staff", staffId);
  return { ok: true };
}

export type ResetPasswordResult =
  | { ok: true; password: string }
  | { ok: false; reason: "not_found" | "inactive" | "self" };

/**
 * Admin resets a colleague's forgotten password.
 *
 * ADMIN ONLY, and the caller must enforce that — an `ops` user resetting an
 * admin's password would be a straight privilege escalation: take the temp
 * password, sign in as the admin, and the role system is decoration.
 *
 * REFUSES SELF-RESET. An admin who knows their own password should change it
 * (which proves they know it); one who has forgotten it cannot be helped by a
 * route that requires being signed in. Allowing it would only mean a walked-up
 * unlocked laptop could mint a fresh admin credential silently.
 *
 * The temp password is `password_must_change`, so the resetting admin's
 * knowledge of it expires at the colleague's next sign-in — the same bounded
 * window as a caregiver's initial PIN.
 */
export async function resetStaffPassword(
  staffId: number,
  actingAdminId: number,
  now: Date = new Date(),
): Promise<ResetPasswordResult> {
  if (staffId === actingAdminId) return { ok: false, reason: "self" };

  const db = getDb();
  const [staff] = await db
    .select({ id: staffAccounts.id, isActive: staffAccounts.isActive })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, staffId))
    .limit(1);

  if (!staff) return { ok: false, reason: "not_found" };
  // A deactivated account does not get a working credential handed to it.
  if (!staff.isActive) return { ok: false, reason: "inactive" };

  const password = generatePassword();
  await db
    .update(staffAccounts)
    .set({
      passwordHash: await hashPassword(password),
      passwordMustChange: true,
      passwordChangedAt: now,
    })
    .where(eq(staffAccounts.id, staffId));

  await revokeAllForSubject("staff", staffId);
  return { ok: true, password };
}

/* --------------------------------------------- self-service forgot-password */

export interface ResetSubject {
  id: number;
  email: string;
  name: string;
  /** `password_changed_at` in ms (0 if null) — the reset token binds to this. */
  passwordChangedAt: number;
}

/**
 * Look up an ACTIVE staff account to send a reset link to. Returns null for an
 * unknown or deactivated email — the caller (the request action) sends the same
 * "if that address exists, check your inbox" either way, so an outsider cannot
 * turn the form into a test of who works here.
 */
export async function findStaffForReset(rawEmail: string): Promise<ResetSubject | null> {
  const email = rawEmail.trim().toLowerCase();
  const [staff] = await getDb()
    .select({
      id: staffAccounts.id,
      email: staffAccounts.email,
      name: staffAccounts.name,
      isActive: staffAccounts.isActive,
      passwordChangedAt: staffAccounts.passwordChangedAt,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.email, email))
    .limit(1);

  if (!staff || !staff.isActive) return null;
  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    passwordChangedAt: staff.passwordChangedAt?.getTime() ?? 0,
  };
}

export type ResetWithTokenResult = { ok: true } | { ok: false; reason: "invalid" };

/**
 * Set a new password from an emailed reset link.
 *
 * SINGLE-USE without a database row: the token carries `pca`, the account's
 * `password_changed_at` at issue time. Success bumps `password_changed_at`, so
 * the same link — and every other outstanding one — stops matching and is
 * refused on a second try. Every failure returns the one opaque reason
 * `invalid`: expired, tampered, already-used, unknown, and deactivated must be
 * indistinguishable, or the message becomes an oracle.
 *
 * `newPassword` is validated by the caller against `newStaffPasswordSchema`;
 * this revokes every session the old password opened, the same as a change.
 */
export async function resetStaffPasswordWithToken(
  token: string | undefined,
  newPassword: string,
  now: Date = new Date(),
): Promise<ResetWithTokenResult> {
  const claims = await verifyResetToken(token);
  if (!claims) return { ok: false, reason: "invalid" };

  const db = getDb();
  const [staff] = await db
    .select({
      id: staffAccounts.id,
      isActive: staffAccounts.isActive,
      passwordChangedAt: staffAccounts.passwordChangedAt,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, claims.staffId))
    .limit(1);

  if (!staff || !staff.isActive) return { ok: false, reason: "invalid" };
  // The binding: the link is stale the instant the password changes.
  if ((staff.passwordChangedAt?.getTime() ?? 0) !== claims.pca) return { ok: false, reason: "invalid" };

  await db
    .update(staffAccounts)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordMustChange: false,
      passwordChangedAt: now,
    })
    .where(eq(staffAccounts.id, staff.id));

  await revokeAllForSubject("staff", staff.id);
  return { ok: true };
}
