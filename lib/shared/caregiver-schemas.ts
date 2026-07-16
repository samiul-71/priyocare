import { z } from "zod";
import { CAREGIVER_EVENT_TYPES } from "./caregiver-events";

/**
 * Caregiver request schemas (PRD §8, module 07). Shared by the PWA and the
 * /api/v1/caregiver/* handlers — one definition, no drift (§10.3).
 */

export const latLngSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * GPS as captured on the device. Optional by design: a check-in must succeed
 * with no fix at all (a stairwell, a denied permission, a cheap chip). No
 * location is an Ops signal at most — never a reason to block the work.
 */
export const capturedLocationSchema = latLngSchema
  .extend({ accuracyM: z.coerce.number().nonnegative().max(100_000).optional() })
  .optional();

const eventUuidSchema = z.string().trim().uuid();
/** Device time. Authoritative (§7) — the server never overwrites it. */
const occurredAtSchema = z.coerce.date();

export const checkInSchema = z.object({
  eventUuid: eventUuidSchema,
  bookingId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema,
  location: capturedLocationSchema,
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = checkInSchema;
export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const taskTickSchema = z.object({
  eventUuid: eventUuidSchema,
  occurredAt: occurredAtSchema,
  tasks: z.array(z.string().trim().min(1).max(200)).max(50),
});
export type TaskTickInput = z.infer<typeof taskTickSchema>;

/** Vitals are free-form per service; validated shape, not clinical content. */
export const vitalsSchema = z
  .object({
    bpSystolic: z.coerce.number().int().min(40).max(300).optional(),
    bpDiastolic: z.coerce.number().int().min(20).max(200).optional(),
    pulse: z.coerce.number().int().min(20).max(250).optional(),
    tempC: z.coerce.number().min(30).max(45).optional(),
    spo2: z.coerce.number().int().min(50).max(100).optional(),
  })
  .optional();

export const careLogSchema = z.object({
  eventUuid: eventUuidSchema,
  occurredAt: occurredAtSchema, // becomes care_logs.logged_at — device time (§7)
  tasksCompleted: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  notes: z.string().trim().max(4000).optional(),
  mood: z.enum(["good", "ok", "poor"]).optional(),
  vitals: vitalsSchema,
});
export type CareLogInput = z.infer<typeof careLogSchema>;

/** Barcode: printed on the tube, entered by camera or by hand (§11 fallback). */
export const sampleScanSchema = z.object({
  eventUuid: eventUuidSchema,
  occurredAt: occurredAtSchema,
  barcode: z.string().trim().min(4).max(32),
});
export type SampleScanInput = z.infer<typeof sampleScanSchema>;

/**
 * One queued event as it crosses the wire (`POST /caregiver/sync`).
 *
 * `payload` stays loose here on purpose: the batch is replayed by type, and a
 * client running an older bundle after a month offline must not have its whole
 * batch rejected because one payload gained a field. The per-type schemas above
 * validate what each handler actually reads.
 */
export const syncEventSchema = z.object({
  eventUuid: eventUuidSchema,
  type: z.enum(CAREGIVER_EVENT_TYPES),
  bookingId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * A whole shift's queue in one request (S-2). Capped so a corrupted client
 * cannot post unbounded work, but generously — a full offline day of ticks,
 * scans and logs is nowhere near 200 events.
 */
export const syncBatchSchema = z.object({
  events: z.array(syncEventSchema).min(1).max(200),
});
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
