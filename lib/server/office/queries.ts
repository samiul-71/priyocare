import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import {
  bookings,
  caregiverVerificationSteps,
  caregivers,
  opsAlerts,
  patientProfiles,
  services,
  staffAccounts,
  staffServices,
  zones,
} from "../db/schema";
import {
  rankEligibleCaregivers,
  type CaregiverForDispatch,
} from "../../shared/dispatch";
import { evaluateActivation, requiredStepsFor } from "../../shared/onboarding";

/**
 * Office read models (PRD §5). All reads are no-DB-safe: without a configured
 * database they return empty, so the pages render their empty state instead of
 * crashing. On the VPS they return live data.
 */

export interface BookingQueueRow {
  id: number;
  bookingCode: string;
  patientName: string | null;
  serviceName: string;
  zoneName: string;
  status: string;
  source: string;
  priceBdt: string;
  createdAt: Date;
}

export async function listBookingQueue(): Promise<BookingQueueRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      patientName: patientProfiles.name,
      serviceName: services.nameEn,
      zoneName: zones.name,
      status: bookings.status,
      source: bookings.source,
      priceBdt: bookings.priceBdt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .leftJoin(patientProfiles, eq(bookings.patientId, patientProfiles.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(zones, eq(bookings.zoneId, zones.id))
    .orderBy(desc(bookings.createdAt))
    .limit(100) as unknown as Promise<BookingQueueRow[]>;
}

export interface OpsAlertRow {
  id: number;
  bookingId: number | null;
  type: string;
  distanceM: string | null;
  status: string;
  createdAt: Date;
}

// Geofence/missed-checkout flags — visible ONLY here (PRD §9, §11, AC 4.2).
export async function listOpsAlerts(): Promise<OpsAlertRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: opsAlerts.id,
      bookingId: opsAlerts.bookingId,
      type: opsAlerts.type,
      distanceM: opsAlerts.distanceM,
      status: opsAlerts.status,
      createdAt: opsAlerts.createdAt,
    })
    .from(opsAlerts)
    .where(eq(opsAlerts.status, "open"))
    .orderBy(desc(opsAlerts.createdAt))
    .limit(100);
}

/**
 * Eligible caregivers for a booking, ranked (PRD §9). Filters approved + skill
 * + zone via the pure `rankEligibleCaregivers`. NOTE: busy-window conflict
 * detection needs each caregiver's current assignments — wired in module 07/09;
 * here `busyWindows` is empty, so ranking covers approval/skill/zone/rating.
 */
export async function listEligibleForBooking(bookingId: number) {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const [booking] = await db
    .select({
      zoneId: bookings.zoneId,
      zoneName: zones.name,
      requiredSkill: services.requiredSkill,
    })
    .from(bookings)
    .leftJoin(zones, eq(bookings.zoneId, zones.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking?.requiredSkill) return [];

  const rows = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      verificationStatus: caregivers.verificationStatus,
      skill: caregivers.skill,
      zones: caregivers.zones,
      ratingAvg: caregivers.ratingAvg,
    })
    .from(caregivers)
    .where(and(eq(caregivers.verificationStatus, "approved"), eq(caregivers.skill, booking.requiredSkill)));

  const candidates: (CaregiverForDispatch & { fullName: string })[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    verificationStatus: r.verificationStatus,
    skill: r.skill,
    zones: (r.zones as Array<string | number>) ?? [],
    ratingAvg: Number(r.ratingAvg),
    busyWindows: [],
    servedPatientBefore: false,
  }));

  return rankEligibleCaregivers(candidates, {
    requiredSkill: booking.requiredSkill,
    zone: booking.zoneName ?? booking.zoneId,
    windowStart: 0,
    windowEnd: 0,
  });
}

/* ------------------------------------------------- caregiver onboarding (§12.2) */

export interface CaregiverRow {
  id: number;
  fullName: string;
  phone: string;
  skill: string;
  verificationStatus: string;
  /** Whether a login PIN has been issued — never the PIN or its hash. */
  hasPin: boolean;
  stepsDone: number;
  stepsRequired: number;
  canActivate: boolean;
  /** Why she is rejected/suspended — null otherwise. Ops must never guess. */
  statusReason: string | null;
}

/**
 * The onboarding board: every caregiver and how far through the checklist they
 * are. `hasPin` is a boolean derived from `pin_hash IS NOT NULL` — the hash
 * itself never leaves the database layer, and there is no query anywhere that
 * selects it into a page.
 */
export async function listCaregivers(): Promise<CaregiverRow[]> {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const rows = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      phone: caregivers.phone,
      skill: caregivers.skill,
      verificationStatus: caregivers.verificationStatus,
      hasPin: sql<boolean>`${caregivers.pinHash} is not null`,
      bnmcRegNo: caregivers.bnmcRegNo,
      bkashPayoutNumber: caregivers.bkashPayoutNumber,
      statusReason: caregivers.statusReason,
    })
    .from(caregivers)
    .orderBy(desc(caregivers.createdAt));

  const steps = await db
    .select({
      caregiverId: caregiverVerificationSteps.caregiverId,
      step: caregiverVerificationSteps.step,
      completedAt: caregiverVerificationSteps.completedAt,
    })
    .from(caregiverVerificationSteps);

  return rows.map((cg) => {
    const done = steps
      .filter((s) => s.caregiverId === cg.id && s.completedAt !== null)
      .map((s) => s.step);
    const activation = evaluateActivation({
      skill: cg.skill,
      completedSteps: done,
      payoutNumber: cg.bkashPayoutNumber ?? null,
      bnmcRegNo: cg.bnmcRegNo ?? null,
    });
    return {
      id: cg.id,
      fullName: cg.fullName,
      phone: cg.phone,
      skill: cg.skill,
      verificationStatus: cg.verificationStatus,
      hasPin: cg.hasPin,
      stepsDone: done.length,
      stepsRequired: requiredStepsFor(cg.skill).length,
      canActivate: activation.canActivate,
      statusReason: cg.statusReason,
    };
  });
}

export interface CaregiverDetail extends CaregiverRow {
  bnmcRegNo: string | null;
  bkashPayoutNumber: string | null;
  completedSteps: string[];
  requiredSteps: string[];
  /** Exactly what is still blocking activation — shown to Ops verbatim. */
  missing: string[];
}

/** One caregiver's file, with the checklist and precisely what is missing. */
export async function getCaregiverDetail(caregiverId: number): Promise<CaregiverDetail | null> {
  if (!isDbConfigured()) return null;
  const db = getDb();

  const [cg] = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      phone: caregivers.phone,
      skill: caregivers.skill,
      verificationStatus: caregivers.verificationStatus,
      hasPin: sql<boolean>`${caregivers.pinHash} is not null`,
      bnmcRegNo: caregivers.bnmcRegNo,
      bkashPayoutNumber: caregivers.bkashPayoutNumber,
      statusReason: caregivers.statusReason,
    })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!cg) return null;

  const stepRows = await db
    .select({
      step: caregiverVerificationSteps.step,
      completedAt: caregiverVerificationSteps.completedAt,
    })
    .from(caregiverVerificationSteps)
    .where(eq(caregiverVerificationSteps.caregiverId, caregiverId));

  const completedSteps = stepRows.filter((s) => s.completedAt !== null).map((s) => s.step);
  const requiredSteps = requiredStepsFor(cg.skill);
  const activation = evaluateActivation({
    skill: cg.skill,
    completedSteps,
    payoutNumber: cg.bkashPayoutNumber ?? null,
    bnmcRegNo: cg.bnmcRegNo ?? null,
  });

  return {
    ...cg,
    completedSteps,
    requiredSteps,
    stepsDone: completedSteps.length,
    stepsRequired: requiredSteps.length,
    canActivate: activation.canActivate,
    missing: activation.missing,
  };
}

/* -------------------------------------------------------- staff accounts */

export interface StaffRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  /** True while the password is still the one an admin handed over. */
  mustChangePassword: boolean;
  createdAt: Date;
}

/**
 * Who has access to the office panel. Admin-only (the page enforces it).
 *
 * There was no way to see this at all before — an admin panel that cannot
 * answer "who can read every patient's address?" is missing something more
 * basic than a feature. `password_hash` is never selected; `mustChangePassword`
 * is the only credential-adjacent fact that leaves this layer.
 */
export async function listStaff(): Promise<StaffRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: staffAccounts.id,
      name: staffAccounts.name,
      email: staffAccounts.email,
      role: staffAccounts.role,
      isActive: staffAccounts.isActive,
      mustChangePassword: staffAccounts.passwordMustChange,
      createdAt: staffAccounts.createdAt,
    })
    .from(staffAccounts)
    .orderBy(desc(staffAccounts.createdAt));
}

export interface LeadServiceRow {
  id: number;
  nameEn: string;
  isActive: boolean;
}

/**
 * The lead-archetype services — the only ones a staff member can be put on a
 * rota for (§9). Visit and placement services dispatch a caregiver to a house
 * and have nothing to do with lead ownership.
 *
 * Inactive ones are included: a service can be switched off in the catalogue
 * while staff are still mapped to it, and silently hiding that mapping would
 * make the rota look emptier than it is.
 */
export async function listLeadServices(): Promise<LeadServiceRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ id: services.id, nameEn: services.nameEn, isActive: services.isActive })
    .from(services)
    .where(eq(services.archetype, "lead"))
    .orderBy(services.sortOrder);
}

/** Every staff↔lead-service pairing, for the rota grid on /office/staff. */
export async function listStaffServices(): Promise<{ staffId: number; serviceId: number }[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
    .from(staffServices);
}
