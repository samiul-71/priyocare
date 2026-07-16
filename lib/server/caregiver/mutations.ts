import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { bookings, careLogs, opsAlerts, samples, syncEvents } from "../db/schema";
import { distanceMetres, isGeofenceMismatch } from "../../shared/geo";
import { orderForReplay } from "../../shared/caregiver-events";
import type { CaregiverEventType } from "../../shared/caregiver-events";

/**
 * Caregiver field writes (PRD §9, module 07).
 *
 * Two rules govern every function here:
 *
 * 1. **Idempotent by `event_uuid`.** Each event is inserted with
 *    `ON CONFLICT (event_uuid) DO NOTHING`. A batch delivered twice — retried
 *    fetch, flaky radio, two devices — produces one row (AC-2.2, S-3). The
 *    conflict path deliberately updates NOTHING, so a replay can never
 *    overwrite the device-captured `occurred_at` (§10).
 *
 * 2. **Device time is authoritative.** `occurredAt` comes from the phone and is
 *    written as-is. A shift worked at 09:00 and synced at 18:00 happened at
 *    09:00. `synced_at` records when we heard about it; the two are different
 *    facts and both are kept.
 */

/** The caregiver is not the one assigned to this booking. */
export class NotAssignedError extends Error {}

export interface AppliedEvent {
  eventUuid: string;
  /** False when the uuid was already stored — a duplicate, not an error. */
  applied: boolean;
}

/**
 * Assert this caregiver owns this booking, and hand back what the geofence
 * needs. Every field write goes through here: a caregiver must never be able to
 * check in on, or log care against, someone else's job by guessing an id.
 */
async function assertAssigned(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  bookingId: number,
  caregiverId: number,
) {
  const [booking] = await tx
    .select({
      id: bookings.id,
      lat: bookings.lat,
      lng: bookings.lng,
      status: bookings.status,
      caregiverId: bookings.caregiverId,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.caregiverId, caregiverId)))
    .limit(1);

  if (!booking) throw new NotAssignedError(`Booking ${bookingId} is not assigned to you.`);
  return booking;
}

/**
 * Record the geofence distance for Ops — and nothing else.
 *
 * Called AFTER the check-in is already recorded, and its result is thrown away
 * by every caller. That is the design (§6 Flow B, AC-1): the caregiver's
 * response is identical at 2km and at the doorstep. If this function ever
 * starts being able to fail a check-in, the module is broken.
 */
async function recordGeofenceAdvisory(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  booking: { id: number; lat: string; lng: string },
  location: { lat: number; lng: number } | undefined,
) {
  if (!location) return; // No fix is not a mismatch — it is no information.

  const target = { lat: Number(booking.lat), lng: Number(booking.lng) };
  if (!isGeofenceMismatch(location, target)) return;

  await tx.insert(opsAlerts).values({
    bookingId: booking.id,
    type: "geofence_mismatch",
    distanceM: distanceMetres(location, target).toFixed(2),
  });
}

interface EventRow {
  eventUuid: string;
  type: CaregiverEventType;
  bookingId: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

/**
 * Insert the event, or report that we already had it.
 * Returns false when the uuid was already present — the caller must then skip
 * the side effects, or a replayed batch would re-apply them.
 */
async function insertEventOnce(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  caregiverId: number,
  event: EventRow,
): Promise<boolean> {
  const inserted = await tx
    .insert(syncEvents)
    .values({
      eventUuid: event.eventUuid,
      caregiverId,
      bookingId: event.bookingId,
      eventType: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt, // device time, never re-stamped
    })
    .onConflictDoNothing({ target: syncEvents.eventUuid })
    .returning({ id: syncEvents.id });

  return inserted.length > 0;
}

/**
 * Check in (Flow B). ALWAYS succeeds for an assigned caregiver — geofence,
 * signal quality and GPS availability are all irrelevant to the outcome.
 */
export async function applyCheckIn(
  input: { eventUuid: string; bookingId: number; occurredAt: Date; location?: { lat: number; lng: number } },
  caregiverId: number,
): Promise<AppliedEvent> {
  return getDb().transaction(async (tx) => {
    const booking = await assertAssigned(tx, input.bookingId, caregiverId);

    const applied = await insertEventOnce(tx, caregiverId, {
      eventUuid: input.eventUuid,
      type: "check_in",
      bookingId: input.bookingId,
      occurredAt: input.occurredAt,
      payload: input.location ? { location: input.location } : {},
    });
    if (!applied) return { eventUuid: input.eventUuid, applied: false };

    await tx
      .update(bookings)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(bookings.id, input.bookingId));

    // Last, and its outcome is discarded: advisory only (AC-1).
    await recordGeofenceAdvisory(tx, booking, input.location);

    return { eventUuid: input.eventUuid, applied: true };
  });
}

export async function applyCheckOut(
  input: { eventUuid: string; bookingId: number; occurredAt: Date; location?: { lat: number; lng: number } },
  caregiverId: number,
): Promise<AppliedEvent> {
  return getDb().transaction(async (tx) => {
    await assertAssigned(tx, input.bookingId, caregiverId);

    const applied = await insertEventOnce(tx, caregiverId, {
      eventUuid: input.eventUuid,
      type: "check_out",
      bookingId: input.bookingId,
      occurredAt: input.occurredAt,
      payload: input.location ? { location: input.location } : {},
    });
    if (!applied) return { eventUuid: input.eventUuid, applied: false };

    await tx
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, input.bookingId));

    return { eventUuid: input.eventUuid, applied: true };
  });
}

/** Tick tasks. The event payload is the record; care_logs holds the final set. */
export async function applyTaskTick(
  input: { eventUuid: string; bookingId: number; occurredAt: Date; tasks: string[] },
  caregiverId: number,
): Promise<AppliedEvent> {
  return getDb().transaction(async (tx) => {
    await assertAssigned(tx, input.bookingId, caregiverId);
    const applied = await insertEventOnce(tx, caregiverId, {
      eventUuid: input.eventUuid,
      type: "task_tick",
      bookingId: input.bookingId,
      occurredAt: input.occurredAt,
      payload: { tasks: input.tasks },
    });
    return { eventUuid: input.eventUuid, applied };
  });
}

/**
 * The end-of-shift care log. `logged_at` is the DEVICE time (§7) and
 * `synced_at` is now — a log written offline at 17:00 and synced at 21:00 says
 * 17:00, because that is when the care happened.
 */
export async function applyCareLog(
  input: {
    eventUuid: string;
    bookingId: number;
    occurredAt: Date;
    tasksCompleted: string[];
    notes?: string;
    vitals?: Record<string, unknown>;
  },
  caregiverId: number,
  now: Date = new Date(),
): Promise<AppliedEvent> {
  return getDb().transaction(async (tx) => {
    await assertAssigned(tx, input.bookingId, caregiverId);

    const applied = await insertEventOnce(tx, caregiverId, {
      eventUuid: input.eventUuid,
      type: "care_log",
      bookingId: input.bookingId,
      occurredAt: input.occurredAt,
      payload: { tasksCompleted: input.tasksCompleted, notes: input.notes, vitals: input.vitals },
    });
    if (!applied) return { eventUuid: input.eventUuid, applied: false };

    await tx.insert(careLogs).values({
      bookingId: input.bookingId,
      caregiverId,
      tasksCompleted: input.tasksCompleted,
      notes: input.notes,
      vitals: input.vitals,
      loggedAt: input.occurredAt,
      syncedAt: now,
    });

    return { eventUuid: input.eventUuid, applied: true };
  });
}

/**
 * Scan a sample barcode — advances chain of custody (§8). Unknown barcodes are
 * recorded as events but change no sample: the tube may not be in the system
 * yet, and losing the scan would break the custody trail worse than an orphan
 * event does.
 */
export async function applySampleScan(
  input: { eventUuid: string; bookingId: number; occurredAt: Date; barcode: string },
  caregiverId: number,
): Promise<AppliedEvent & { sampleFound: boolean }> {
  return getDb().transaction(async (tx) => {
    await assertAssigned(tx, input.bookingId, caregiverId);

    const applied = await insertEventOnce(tx, caregiverId, {
      eventUuid: input.eventUuid,
      type: "sample_scan",
      bookingId: input.bookingId,
      occurredAt: input.occurredAt,
      payload: { barcode: input.barcode },
    });
    if (!applied) return { eventUuid: input.eventUuid, applied: false, sampleFound: false };

    const [sample] = await tx
      .select({ id: samples.id })
      .from(samples)
      .where(eq(samples.barcode, input.barcode))
      .limit(1);

    if (sample) {
      await tx
        .update(samples)
        .set({ collectedAt: input.occurredAt, status: "collected" })
        .where(eq(samples.id, sample.id));
    } else {
      await tx.insert(samples).values({
        bookingId: input.bookingId,
        barcode: input.barcode,
        status: "collected",
        collectedAt: input.occurredAt,
      });
    }

    return { eventUuid: input.eventUuid, applied: true, sampleFound: !!sample };
  });
}

export interface SyncResult {
  applied: number;
  duplicates: number;
  results: AppliedEvent[];
}

/**
 * Replay a whole offline batch (S-2, AC-2).
 *
 * Ordered by DEVICE time before replay, so a check-out can never land before
 * its check-in just because the radio delivered it first. Each event is applied
 * through the same function the online path uses, so an offline shift and an
 * online one produce identical rows — there is no second code path to drift.
 *
 * A failed event does not sink the batch: the rest still sync and the failure
 * is reported per-uuid, because a caregiver's whole day must not be lost to one
 * bad row.
 */
export async function syncBatch(
  events: {
    eventUuid: string;
    type: CaregiverEventType;
    bookingId: number;
    occurredAt: Date;
    payload: Record<string, unknown>;
  }[],
  caregiverId: number,
): Promise<SyncResult> {
  const ordered = orderForReplay(
    events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
  );

  const results: AppliedEvent[] = [];

  for (const event of ordered) {
    const occurredAt = new Date(event.occurredAt);
    const base = { eventUuid: event.eventUuid, bookingId: event.bookingId, occurredAt };
    const payload = event.payload as Record<string, never>;

    try {
      switch (event.type) {
        case "check_in":
          results.push(await applyCheckIn({ ...base, location: payload.location }, caregiverId));
          break;
        case "check_out":
          results.push(await applyCheckOut({ ...base, location: payload.location }, caregiverId));
          break;
        case "task_tick":
          results.push(
            await applyTaskTick({ ...base, tasks: payload.tasks ?? [] }, caregiverId),
          );
          break;
        case "care_log":
          results.push(
            await applyCareLog(
              {
                ...base,
                tasksCompleted: payload.tasksCompleted ?? [],
                notes: payload.notes,
                vitals: payload.vitals,
              },
              caregiverId,
            ),
          );
          break;
        case "sample_scan":
          results.push(await applySampleScan({ ...base, barcode: payload.barcode }, caregiverId));
          break;
      }
    } catch (err) {
      // Not assigned / bad data: report it, keep the rest of the day.
      if (err instanceof NotAssignedError) {
        results.push({ eventUuid: event.eventUuid, applied: false });
        continue;
      }
      throw err;
    }
  }

  const applied = results.filter((r) => r.applied).length;
  return { applied, duplicates: results.length - applied, results };
}

/**
 * Flag bookings whose caregiver never checked in / never checked out (§11).
 * A scheduled job on the VPS; a plain function here so it stays testable.
 */
export async function flagMissedCheckIns(cutoff: Date): Promise<{ flagged: number }> {
  return getDb().transaction(async (tx) => {
    // Dispatched, past the cutoff, no check-in event, and not already flagged —
    // the last clause is what stops the job re-alerting on every run.
    const stranded = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "dispatched"),
          lt(bookings.updatedAt, cutoff),
          sql`not exists (
            select 1 from ${syncEvents}
            where ${syncEvents.bookingId} = ${bookings.id}
              and ${syncEvents.eventType} = 'check_in'
          )`,
          sql`not exists (
            select 1 from ${opsAlerts}
            where ${opsAlerts.bookingId} = ${bookings.id}
              and ${opsAlerts.type} = 'missed_checkin'
          )`,
        ),
      );

    if (stranded.length === 0) return { flagged: 0 };

    await tx
      .insert(opsAlerts)
      .values(stranded.map((b) => ({ bookingId: b.id, type: "missed_checkin" as const })));

    return { flagged: stranded.length };
  });
}
