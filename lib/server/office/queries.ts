import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import {
  bookings,
  caregivers,
  opsAlerts,
  patientProfiles,
  services,
  zones,
} from "../db/schema";
import {
  rankEligibleCaregivers,
  type CaregiverForDispatch,
} from "../../shared/dispatch";

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
