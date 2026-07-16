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
import { formatBookingCode } from "../../shared/booking-code";
import { ratingTriggersComplaint } from "../../shared/complaints";
import { evaluateActivation, type ActivationResult } from "../../shared/onboarding";
import type { PhoneBookingInput } from "../../shared/office-schemas";

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
 */
export async function suspendCaregiver(caregiverId: number) {
  await getDb()
    .update(caregivers)
    .set({ verificationStatus: "suspended" })
    .where(eq(caregivers.id, caregiverId));
  await revokeAllForSubject("caregiver", caregiverId);
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
