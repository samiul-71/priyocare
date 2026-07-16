import { z } from "zod";
import { bdPhone } from "./auth-schemas";
import { SERIOUS_TAGS } from "./complaints";

/**
 * Office/admin request schemas (PRD §8), shared by the office pages and the
 * /api/v1/office/* handlers.
 */

export const paymentMethodSchema = z.enum(["bkash", "nagad", "rocket", "card", "cash"]);

// Manual phone booking (P0, §3.1). Ops quotes the price on the call, so it is
// entered here; landmark is required — Dhaka runs on landmarks (§7.2).
export const phoneBookingSchema = z.object({
  callerName: z.string().trim().min(1).max(120),
  patientName: z.string().trim().min(1).max(120),
  patientPhone: bdPhone,
  serviceId: z.coerce.number().int().positive(),
  zoneId: z.coerce.number().int().positive(),
  addressLine: z.string().trim().min(1).max(500),
  landmark: z.string().trim().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  slotId: z.coerce.number().int().positive().optional(),
  priceBdt: z.coerce.number().positive().max(10_000_000),
  paymentMethod: paymentMethodSchema,
});
export type PhoneBookingInput = z.infer<typeof phoneBookingSchema>;

export const dispatchSchema = z.object({
  caregiverId: z.coerce.number().int().positive(),
  // required when the chosen caregiver is not the top-ranked one (AC 3.1)
  reason: z.string().trim().max(500).optional(),
});

export const verifyStepSchema = z.object({
  step: z.enum([
    "nid",
    "photo",
    "police_clearance",
    "skill_cert",
    "interview",
    "references",
    "safeguarding",
  ]),
});

export const suspendSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  seriousTag: z.enum(SERIOUS_TAGS).optional(),
});
