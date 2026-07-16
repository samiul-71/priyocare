import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { caregivers, staffAccounts } from "../db/schema";
import { verifyPassword, verifyPin } from "./password";
import type { StaffRole } from "./tokens";

/**
 * Credential verification, extracted so the two callers cannot drift:
 *   - the `/api/v1/auth/…/login` handlers — for API clients, which get a
 *     Bearer pair
 *   - the sign-in Server Action — for the browser, which gets only a cookie
 *
 * Two implementations of "is this password right" is precisely the kind of
 * duplication that ends with one of them forgetting the `is_active` check.
 */

export interface VerifiedStaff {
  id: number;
  role: StaffRole;
}

/**
 * Returns the staff account, or null for wrong email, wrong password, OR a
 * deactivated account. The caller cannot tell which — and must not: a login
 * that distinguishes "no such user" from "wrong password" is a user enumerator.
 */
export async function verifyStaffCredentials(
  email: string,
  password: string,
): Promise<VerifiedStaff | null> {
  const [staff] = await getDb()
    .select({
      id: staffAccounts.id,
      role: staffAccounts.role,
      passwordHash: staffAccounts.passwordHash,
      isActive: staffAccounts.isActive,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.email, email))
    .limit(1);

  if (!staff || !staff.isActive) return null;
  if (!(await verifyPassword(staff.passwordHash, password))) return null;
  return { id: staff.id, role: staff.role };
}

/**
 * Caregiver phone + PIN. Null for an unknown phone, a wrong PIN, a caregiver
 * with no PIN yet (§12.2 — not through onboarding), or a suspended one. Again
 * indistinguishable to the caller by design.
 */
export async function verifyCaregiverCredentials(
  phone: string,
  pin: string,
): Promise<{ id: number } | null> {
  const [caregiver] = await getDb()
    .select({
      id: caregivers.id,
      pinHash: caregivers.pinHash,
      verificationStatus: caregivers.verificationStatus,
    })
    .from(caregivers)
    .where(eq(caregivers.phone, phone))
    .limit(1);

  if (!caregiver || !caregiver.pinHash) return null;
  if (caregiver.verificationStatus !== "approved") return null;
  if (!(await verifyPin(caregiver.pinHash, pin))) return null;
  return { id: caregiver.id };
}
