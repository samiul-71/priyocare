import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { caregivers } from "../db/schema";
import { hashPin, verifyPin } from "../auth/password";
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
