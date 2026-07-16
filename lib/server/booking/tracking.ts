import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import { bookings, caregivers, samples, services } from "../db/schema";

/**
 * Customer-facing tracking read models (PRD §5, §9). These select ONLY
 * customer-safe fields. Geofence distance, raw lat/lng, and ops alerts are
 * deliberately never selected here — a >500m mismatch is invisible to the
 * customer (AC 4.2). Masked calling replaces raw phone numbers. No-DB-safe.
 */

export interface BookingTracking {
  id: number;
  bookingCode: string;
  status: string;
  serviceName: string | null;
  landmark: string;
  caregiverName: string | null;
  caregiverRating: string | null;
  caregiverPhotoUrl: string | null;
}

export async function getBookingTracking(
  bookingId: number,
): Promise<BookingTracking | null> {
  if (!isDbConfigured()) return null;
  const [row] = await getDb()
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      serviceName: services.nameEn,
      landmark: bookings.landmark,
      caregiverName: caregivers.fullName,
      caregiverRating: caregivers.ratingAvg,
      caregiverPhotoUrl: caregivers.photoUrl,
      // NOTE: no lat/lng, no distance, no geofence — never exposed to customers.
    })
    .from(bookings)
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(caregivers, eq(bookings.caregiverId, caregivers.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

export interface SampleStatus {
  sampleId: number;
  status: string;
  hasReport: boolean;
}

export async function getSampleStatus(
  bookingId: number,
): Promise<SampleStatus | null> {
  if (!isDbConfigured()) return null;
  const [row] = await getDb()
    .select({
      sampleId: samples.id,
      status: samples.status,
      reportUrl: samples.reportUrl,
    })
    .from(samples)
    .where(eq(samples.bookingId, bookingId))
    .orderBy(desc(samples.createdAt))
    .limit(1);
  if (!row) return null;
  return { sampleId: row.sampleId, status: row.status, hasReport: !!row.reportUrl };
}

/** Resolve a sample's stored report location (private storage) after the signed
 * link has been verified. */
export async function getSampleReportUrl(sampleId: number): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const [row] = await getDb()
    .select({ reportUrl: samples.reportUrl })
    .from(samples)
    .where(eq(samples.id, sampleId))
    .limit(1);
  return row?.reportUrl ?? null;
}
