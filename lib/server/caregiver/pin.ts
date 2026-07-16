import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { caregivers } from "../db/schema";
import { generatePin, hashPin, verifyPin } from "../auth/password";
import { revokeAllForSubject } from "../auth/sessions";

/**
 * Caregiver PIN change (§12.2).
 *
 * WHY THIS EXISTS: the initial PIN is issued by Ops, who read it out to her —
 * so for a moment, someone else knows her credential. That is a real gap: with
 * it, an Ops user could sign in AS a caregiver, and everything the system takes
 * seriously downstream (geofence invisibility, the complaint trail, who
 * actually checked in at a patient's door) quietly stops meaning anything.
 * Forcing her to replace it is what closes it.
 *
 * REVOKING WHAT THE OLD PIN OPENED is the half that is easy to forget. If Ops
 * had signed in with the initial PIN, they hold a 30-day session; changing the
 * PIN must end it, or the change is theatre. Two mechanisms, because the two
 * credentials revoke differently:
 *   - refresh tokens are rows → revoke them outright
 *   - the page cookie is a stateless JWT with nothing to revoke → stamp
 *     `pin_changed_at`, and the guard refuses any session issued before it
 */

export type ResetPinResult =
  | { ok: true; pin: string }
  | { ok: false; reason: "not_found" | "not_approved" };

/**
 * Ops-mediated reset, for a caregiver who has forgotten her PIN (§12.2).
 *
 * A DIFFERENT operation from `issueCaregiverPin`, which refuses when a PIN
 * already exists — that refusal is deliberate (re-issuing by accident would
 * lock out a working caregiver mid-shift), so getting back in has to be an
 * explicit, deliberate act rather than a retry of issuance.
 *
 * The trust model is the same as onboarding and no weaker: Ops already knows
 * this woman — they interviewed her, checked her NID and her police clearance.
 * Verifying her over the phone is exactly what they did at the interview. The
 * new PIN is `pin_must_change`, so Ops' knowledge of it survives only until her
 * next sign-in, which is the same bounded window as the initial issue.
 *
 * Everything the old PIN opened dies here — including any session Ops opened
 * with it. See changeCaregiverPin for why that takes two mechanisms.
 */
export async function resetCaregiverPin(
  caregiverId: number,
  now: Date = new Date(),
): Promise<ResetPinResult> {
  const db = getDb();

  const [caregiver] = await db
    .select({ id: caregivers.id, verificationStatus: caregivers.verificationStatus })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!caregiver) return { ok: false, reason: "not_found" };
  // A suspended caregiver does not get a fresh credential (Flow C).
  if (caregiver.verificationStatus !== "approved") return { ok: false, reason: "not_approved" };

  const pin = generatePin();
  await db
    .update(caregivers)
    .set({ pinHash: await hashPin(pin), pinMustChange: true, pinChangedAt: now })
    .where(eq(caregivers.id, caregiverId));
  await revokeAllForSubject("caregiver", caregiverId);

  return { ok: true, pin };
}

/**
 * Self-service reset (§10.1's OTP fallback). Sets the PIN she chose herself
 * after an OTP proved she holds the phone.
 *
 * `pin_must_change` is FALSE here, unlike the Ops path — nobody else ever saw
 * this PIN, so there is nothing to force her to replace. That asymmetry is the
 * whole reason this flow is worth having.
 *
 * The caller MUST have verified the OTP first; this function does not check it.
 */
export async function setPinAfterOtp(
  caregiverId: number,
  newPin: string,
  now: Date = new Date(),
): Promise<boolean> {
  const db = getDb();

  const [caregiver] = await db
    .select({ id: caregivers.id, verificationStatus: caregivers.verificationStatus })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!caregiver || caregiver.verificationStatus !== "approved") return false;

  await db
    .update(caregivers)
    .set({ pinHash: await hashPin(newPin), pinMustChange: false, pinChangedAt: now })
    .where(eq(caregivers.id, caregiverId));
  // A forgotten PIN may mean a lost phone — end every existing session.
  await revokeAllForSubject("caregiver", caregiverId);

  return true;
}

export type ChangePinResult =
  | { ok: true; caregiverId: number }
  | { ok: false; reason: "not_found" | "wrong_pin" | "not_approved" };

export async function changeCaregiverPin(
  caregiverId: number,
  currentPin: string,
  newPin: string,
  now: Date = new Date(),
): Promise<ChangePinResult> {
  const db = getDb();

  const [caregiver] = await db
    .select({
      id: caregivers.id,
      pinHash: caregivers.pinHash,
      verificationStatus: caregivers.verificationStatus,
    })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!caregiver || !caregiver.pinHash) return { ok: false, reason: "not_found" };
  if (caregiver.verificationStatus !== "approved") return { ok: false, reason: "not_approved" };

  // The current PIN is what proves this is her and not a hijacked session.
  if (!(await verifyPin(caregiver.pinHash, currentPin))) {
    return { ok: false, reason: "wrong_pin" };
  }

  await db
    .update(caregivers)
    .set({
      pinHash: await hashPin(newPin),
      pinMustChange: false,
      pinChangedAt: now, // invalidates every page session issued before now
    })
    .where(eq(caregivers.id, caregiverId));

  // Kills any Bearer session opened with the old PIN — including her own, which
  // is why the caller must issue her a fresh one immediately after.
  await revokeAllForSubject("caregiver", caregiverId);

  return { ok: true, caregiverId };
}
