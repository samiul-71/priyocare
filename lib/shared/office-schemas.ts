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

export const caregiverSkillSchema = z.enum([
  "phlebotomist",
  "attendant",
  "nurse",
  "physiotherapist",
  "babysitter",
]);

/**
 * A document reference as held on a caregiver's file.
 *
 * NOT a URL, despite the `*_url` column names (module 02 named them before the
 * storage decision). A caller-supplied URL would let anyone point a caregiver's
 * "police clearance" at any address on the internet — for the highest-trust
 * records in the system. So this is an opaque reference: a private-storage key
 * once §19 lands, and Ops' physical filing reference until then. It is never
 * rendered as a link.
 */
const documentRef = z.string().trim().min(1).max(300);

/**
 * Caregiver intake (§12.2). Creates the APPLICATION only — `verification_status`
 * starts `pending` and `pin_hash` stays null. Nothing here can approve anyone or
 * issue a credential; that needs the full checklist and a separate call.
 *
 * Documents are required at intake because Ops takes them at the interview —
 * the steps table records that a human *verified* each one, which is a
 * different fact from having a scan on file.
 */
export const createCaregiverSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: bdPhone,
  skill: caregiverSkillSchema,
  bnmcRegNo: z.string().trim().min(1).max(30).optional(), // mandatory for nurses at activation
  nidFrontRef: documentRef,
  nidBackRef: documentRef,
  photoRef: documentRef,
  policeClearanceRef: documentRef,
  zones: z.array(z.coerce.number().int().positive()).max(20).default([]),
  bkashPayoutNumber: bdPhone.optional(),
});
export type CreateCaregiverInput = z.infer<typeof createCaregiverSchema>;

/**
 * Update the file. `bkashPayoutNumber` matters most: no payout number, no
 * activation (§12.2) — we do not let someone work before we can pay them.
 */
export const updateCaregiverSchema = z
  .object({
    bkashPayoutNumber: bdPhone.optional(),
    bnmcRegNo: z.string().trim().min(1).max(30).optional(),
    zones: z.array(z.coerce.number().int().positive()).max(20).optional(),
  })
  .refine((v) => Object.values(v).some((f) => f !== undefined), {
    message: "Nothing to update.",
  });
export type UpdateCaregiverInput = z.infer<typeof updateCaregiverSchema>;
