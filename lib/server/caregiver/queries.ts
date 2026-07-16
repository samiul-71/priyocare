import "server-only";

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import {
  bookingItems,
  bookings,
  patientProfiles,
  services,
  syncEvents,
} from "../db/schema";

/**
 * Caregiver reads (PRD §5, §9, module 07). Empty-safe: with no DATABASE_URL
 * these return null/empty so the shell still renders (§11 — never blank).
 */

export interface TodayJob {
  bookingId: number;
  bookingCode: string;
  patientName: string;
  serviceName: string;
  addressLine: string;
  landmark: string;
  status: string;
  /** The service's task ticklist, from the booked items (§5). */
  tasks: string[];
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
}

/**
 * Today's assigned job.
 *
 * NOTE what is NOT selected: `lat`/`lng`. The caregiver app never needs the
 * booking's coordinates — it captures its own GPS and the server does the
 * comparison. Sending them would put the geofence target on the device, where
 * anyone could read it and know exactly how far they may stray (AC-1: the
 * geofence is invisible to the caregiver). The address and landmark are what
 * she actually navigates by.
 */
export async function getTodayJob(
  caregiverId: number,
  now: Date = new Date(),
): Promise<TodayJob | null> {
  if (!isDbConfigured()) return null;
  const db = getDb();

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [job] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      patientName: patientProfiles.name,
      serviceName: services.nameEn,
      addressLine: bookings.addressLine,
      landmark: bookings.landmark,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(patientProfiles, eq(patientProfiles.id, bookings.patientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.caregiverId, caregiverId),
        inArray(bookings.status, ["dispatched", "en_route", "arrived", "in_progress"]),
        gte(bookings.createdAt, startOfDay),
        lt(bookings.createdAt, endOfDay),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  if (!job) return null;

  const items = await db
    .select({ name: bookingItems.nameSnapshot })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, job.bookingId));

  const events = await db
    .select({ eventType: syncEvents.eventType, occurredAt: syncEvents.occurredAt })
    .from(syncEvents)
    .where(eq(syncEvents.bookingId, job.bookingId));

  return {
    ...job,
    tasks: items.map((i) => i.name),
    checkedInAt: events.find((e) => e.eventType === "check_in")?.occurredAt ?? null,
    checkedOutAt: events.find((e) => e.eventType === "check_out")?.occurredAt ?? null,
  };
}
