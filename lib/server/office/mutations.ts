import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import {
  bookings,
  caregiverVerificationSteps,
  caregivers,
  complaints,
  patientProfiles,
  payments,
  users,
} from "../db/schema";
import { revokeAllForSubject } from "../auth/sessions";
import { generatePin, hashPin } from "../auth/password";
import { formatBookingCode } from "../../shared/booking-code";
import { ratingTriggersComplaint } from "../../shared/complaints";
import { evaluateActivation, type ActivationResult } from "../../shared/onboarding";
import type {
  CreateCaregiverInput,
  PhoneBookingInput,
  UpdateCaregiverInput,
} from "../../shared/office-schemas";

/**
 * Manual phone booking (P0, PRD §3.1). Records a booking taken over the hotline
 * for any service — including those with no web flow — with `source='phone'`
 * and `created_by_staff`, so the web-vs-phone shift is measurable (§7.2). The
 * caller's number find-or-creates a customer and a patient profile.
 */
export async function createPhoneBooking(input: PhoneBookingInput, staffId: number) {
  return getDb().transaction(async (tx) => {
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.phone, input.patientPhone))
      .limit(1);
    const user =
      existingUser ??
      (await tx.insert(users).values({ name: input.patientName, phone: input.patientPhone }).returning())[0];

    const [patient] = await tx
      .insert(patientProfiles)
      .values({ userId: user.id, name: input.patientName })
      .returning();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [{ c }] = await tx
      .select({ c: count() })
      .from(bookings)
      .where(gte(bookings.createdAt, startOfDay));
    const bookingCode = formatBookingCode(Number(c) + 1);

    const [booking] = await tx
      .insert(bookings)
      .values({
        bookingCode,
        customerId: user.id,
        patientId: patient.id,
        serviceId: input.serviceId,
        slotId: input.slotId,
        zoneId: input.zoneId,
        addressLine: input.addressLine,
        landmark: input.landmark,
        lat: String(input.lat),
        lng: String(input.lng),
        priceBdt: input.priceBdt.toFixed(2),
        status: "confirmed",
        source: "phone",
        createdByStaff: staffId,
      })
      .returning();

    await tx.insert(payments).values({
      bookingId: booking.id,
      method: input.paymentMethod,
      status: "pending",
      amountBdt: input.priceBdt.toFixed(2),
    });

    return booking;
  });
}

/** Assign a caregiver and dispatch. `overrideReason` is stored when the chosen
 * caregiver is not the top-ranked one (AC 3.1). */
export async function assignCaregiver(
  bookingId: number,
  caregiverId: number,
  overrideReason?: string,
) {
  await getDb()
    .update(bookings)
    .set({
      caregiverId,
      status: "dispatched",
      dispatchOverrideReason: overrideReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
}

/** A caregiver already exists with this phone number. */
export class DuplicateCaregiverError extends Error {}

/**
 * Start a caregiver application (PRD §12.2, module 08 §5 row 5).
 *
 * This is intake and ONLY intake. The row lands `pending` with `pin_hash` null,
 * which is not an oversight — §12.2 says no PIN before the checklist, and the
 * caregiver login handler already refuses anyone whose `pin_hash` is null or
 * whose status is not `approved`. So a freshly created caregiver cannot log in,
 * cannot be dispatched (the eligibility filter requires `approved`), and cannot
 * be activated until every step, the payout number, and BNMC-for-nurses exist.
 *
 * The phone number is the identity: a duplicate is rejected rather than merged,
 * because two people sharing a number is a real thing here and silently
 * attaching one person's clearance to another's file is unthinkable.
 */
export async function createCaregiverApplication(
  input: CreateCaregiverInput,
): Promise<{ id: number; verificationStatus: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: caregivers.id })
    .from(caregivers)
    .where(eq(caregivers.phone, input.phone))
    .limit(1);
  if (existing) {
    throw new DuplicateCaregiverError(`A caregiver already exists for ${input.phone}.`);
  }

  const [created] = await db
    .insert(caregivers)
    .values({
      fullName: input.fullName,
      phone: input.phone,
      skill: input.skill,
      bnmcRegNo: input.bnmcRegNo,
      // Columns are named *_url for historical reasons; these are references,
      // never caller-supplied URLs (see office-schemas.ts).
      nidFrontUrl: input.nidFrontRef,
      nidBackUrl: input.nidBackRef,
      photoUrl: input.photoRef,
      policeClearanceUrl: input.policeClearanceRef,
      bkashPayoutNumber: input.bkashPayoutNumber,
      zones: input.zones,
      verificationStatus: "pending", // the only status intake may produce
      // pin_hash deliberately absent — issued at activation, never before.
    })
    .returning({ id: caregivers.id, verificationStatus: caregivers.verificationStatus });

  return created;
}

/** Update a caregiver's file — payout number, BNMC, zones (§12.2). */
export async function updateCaregiverFile(
  caregiverId: number,
  input: UpdateCaregiverInput,
): Promise<boolean> {
  const updated = await getDb()
    .update(caregivers)
    .set({
      ...(input.bkashPayoutNumber !== undefined
        ? { bkashPayoutNumber: input.bkashPayoutNumber }
        : {}),
      ...(input.bnmcRegNo !== undefined ? { bnmcRegNo: input.bnmcRegNo } : {}),
      ...(input.zones !== undefined ? { zones: input.zones } : {}),
    })
    .where(eq(caregivers.id, caregiverId))
    .returning({ id: caregivers.id });

  return updated.length > 0;
}

export type IssuePinResult =
  | { ok: true; pin: string }
  | { ok: false; reason: "not_found" | "not_approved" | "already_issued"; missing?: string[] };

/**
 * Issue the initial login PIN — the last link in the chain, and the one that
 * actually lets a caregiver into the app (module 07 was unusable without it).
 *
 * THE GATE (§12.2): the activation rules are re-evaluated here from the
 * database, not trusted from the caller and not inferred from
 * `verification_status` alone. Status could have been set by an older code
 * path; the checklist is the truth. No steps, no payout, no BNMC → no PIN, and
 * therefore no login and no dispatch.
 *
 * Refuses to overwrite an existing PIN: re-issuing would silently lock out a
 * working caregiver mid-shift. A forgotten PIN is a reset (OTP fallback, §10.1)
 * — a different operation with a different audit story.
 *
 * The plaintext PIN is returned ONCE for Ops to hand over and is never stored,
 * logged, or retrievable. See the trade-off note in the route handler.
 */
export async function issueCaregiverPin(caregiverId: number): Promise<IssuePinResult> {
  const db = getDb();

  const [cg] = await db
    .select({
      id: caregivers.id,
      skill: caregivers.skill,
      pinHash: caregivers.pinHash,
      bnmcRegNo: caregivers.bnmcRegNo,
      bkashPayoutNumber: caregivers.bkashPayoutNumber,
      verificationStatus: caregivers.verificationStatus,
    })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!cg) return { ok: false, reason: "not_found" };
  if (cg.pinHash) return { ok: false, reason: "already_issued" };

  const stepRows = await db
    .select({ step: caregiverVerificationSteps.step })
    .from(caregiverVerificationSteps)
    .where(eq(caregiverVerificationSteps.caregiverId, caregiverId));

  const activation = evaluateActivation({
    skill: cg.skill,
    completedSteps: stepRows.map((r) => r.step),
    payoutNumber: cg.bkashPayoutNumber ?? null,
    bnmcRegNo: cg.bnmcRegNo ?? null,
  });

  // Both must hold: the checklist passes AND someone activated them.
  if (!activation.canActivate || cg.verificationStatus !== "approved") {
    return {
      ok: false,
      reason: "not_approved",
      missing: activation.canActivate ? ["activation"] : activation.missing,
    };
  }

  const pin = generatePin();
  await db
    .update(caregivers)
    .set({
      pinHash: await hashPin(pin),
      // Ops is about to read this out, so they know it. She cannot reach any
      // screen but /caregiver/change-pin until she replaces it (§12.2).
      pinMustChange: true,
      pinChangedAt: new Date(),
    })
    .where(eq(caregivers.id, caregiverId));

  return { ok: true, pin };
}

/** Mark one verification step complete (PRD §12.2). */
export async function transitionVerificationStep(
  caregiverId: number,
  step:
    | "nid"
    | "photo"
    | "police_clearance"
    | "skill_cert"
    | "interview"
    | "references"
    | "safeguarding",
  staffId: number,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(caregiverVerificationSteps)
    .where(
      and(
        eq(caregiverVerificationSteps.caregiverId, caregiverId),
        eq(caregiverVerificationSteps.step, step),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(caregiverVerificationSteps)
      .set({ completedAt: new Date(), reviewedBy: staffId })
      .where(eq(caregiverVerificationSteps.id, existing.id));
  } else {
    await db
      .insert(caregiverVerificationSteps)
      .values({ caregiverId, step, completedAt: new Date(), reviewedBy: staffId });
  }
}

/**
 * Attempt to activate a caregiver. Returns the activation result; only flips
 * verification_status to 'approved' when all steps + payout (and BNMC for
 * nurses) are present (AC 2.2). Never a UI-layer bypass.
 */
export async function activateCaregiver(caregiverId: number): Promise<ActivationResult> {
  const db = getDb();
  const [cg] = await db.select().from(caregivers).where(eq(caregivers.id, caregiverId)).limit(1);
  if (!cg) return { canActivate: false, missing: ["caregiver_not_found"] };

  const stepRows = await db
    .select({ step: caregiverVerificationSteps.step })
    .from(caregiverVerificationSteps)
    .where(eq(caregiverVerificationSteps.caregiverId, caregiverId));

  const result = evaluateActivation({
    skill: cg.skill,
    completedSteps: stepRows.map((r) => r.step),
    payoutNumber: cg.bkashPayoutNumber ?? null,
    bnmcRegNo: cg.bnmcRegNo ?? null,
  });

  if (result.canActivate) {
    await db
      .update(caregivers)
      .set({ verificationStatus: "approved" })
      .where(eq(caregivers.id, caregiverId));
  }
  return result;
}

/**
 * Suspend a caregiver from all dispatch and immediately revoke every active
 * refresh token (PRD §9, §10.1) — not just dispatch eligibility.
 *
 * The reason is now RECORDED. It used to be required by `suspendSchema`,
 * parsed by the handler, and then dropped on the floor — so a caregiver's work
 * could end and nothing anywhere said why. That is not a small thing: it is her
 * livelihood, and Ops needed to be able to answer for it.
 */
export async function suspendCaregiver(
  caregiverId: number,
  reason: string,
  staffId: number,
  now: Date = new Date(),
) {
  await getDb()
    .update(caregivers)
    .set({
      verificationStatus: "suspended",
      statusReason: reason,
      statusChangedBy: staffId,
      statusChangedAt: now,
    })
    .where(eq(caregivers.id, caregiverId));
  await revokeAllForSubject("caregiver", caregiverId);
}

export type RejectResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_approved" };

/**
 * Reject an application (§12.2). The `rejected` status existed in the enum and
 * **nothing set it** — a failed police check had no recorded outcome at all,
 * so the application simply sat at `pending` forever, indistinguishable from
 * one nobody had got to yet.
 *
 * REFUSES AN APPROVED CAREGIVER. Rejection is a verdict on an application;
 * pulling a working caregiver is `suspendCaregiver`, which is Flow C and exists
 * precisely for that. Blurring the two would lose the distinction between "we
 * never took her on" and "we took her on and something went wrong" — which are
 * very different facts about a person.
 *
 * Tokens are revoked anyway: she should not have any (no PIN before approval),
 * and if she somehow does, a rejection should end them.
 */
export async function rejectCaregiver(
  caregiverId: number,
  reason: string,
  staffId: number,
  now: Date = new Date(),
): Promise<RejectResult> {
  const db = getDb();

  const [cg] = await db
    .select({ id: caregivers.id, verificationStatus: caregivers.verificationStatus })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!cg) return { ok: false, reason: "not_found" };
  if (cg.verificationStatus === "approved") return { ok: false, reason: "already_approved" };

  await db
    .update(caregivers)
    .set({
      verificationStatus: "rejected",
      statusReason: reason,
      statusChangedBy: staffId,
      statusChangedAt: now,
    })
    .where(eq(caregivers.id, caregiverId));
  await revokeAllForSubject("caregiver", caregiverId);

  return { ok: true };
}

/**
 * Reopen a rejected application, back to `pending`.
 *
 * This exists because rejection would otherwise be a trap: `caregivers.phone`
 * is unique, so a rejected woman who comes back with a valid police clearance
 * cannot re-apply — intake would 409 on her number — and a rejection made in
 * error would permanently lock a real person out of working here, with no route
 * back that does not involve someone editing the database.
 *
 * The reason is deliberately KEPT, not cleared: why she was once rejected is
 * exactly the thing the next reviewer needs to see.
 */
export async function reopenCaregiverApplication(
  caregiverId: number,
  staffId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await getDb()
    .update(caregivers)
    .set({ verificationStatus: "pending", statusChangedBy: staffId, statusChangedAt: now })
    .where(and(eq(caregivers.id, caregiverId), eq(caregivers.verificationStatus, "rejected")))
    .returning({ id: caregivers.id });

  return updated.length > 0;
}

/** Auto-create a complaint for a 1–2★ rating (PRD §9, AC 1.1). No-op for 3★+. */
export async function autoCreateComplaint(
  bookingId: number,
  caregiverId: number | null,
  rating: number,
) {
  if (!ratingTriggersComplaint(rating)) return null;
  const [complaint] = await getDb()
    .insert(complaints)
    .values({
      bookingId,
      caregiverId,
      source: "auto_low_rating",
      severity: "low",
      status: "open",
    })
    .returning();
  return complaint;
}
