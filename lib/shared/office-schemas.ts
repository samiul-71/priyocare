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

/**
 * Reject an application (§12.2). The reason is REQUIRED and recorded — this
 * ends someone's chance of work, and "why?" must have an answer six months
 * later when she asks, or when Ops is asked to justify the pattern.
 *
 * Distinct from suspend: reject is for an application that never passed
 * verification (the police check came back bad, the references did not check
 * out). A caregiver who is already working gets suspended, which is Flow C and
 * revokes her tokens.
 */
export const rejectCaregiverSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to reject an application").max(500),
});
export type RejectCaregiverInput = z.infer<typeof rejectCaregiverSchema>;

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

/**
 * Which lead services a staff member is on the rota for (§9).
 *
 * The archetype check is NOT here — it needs the database (a service's
 * archetype can change) and lives in `setStaffLeadServices`, inside the
 * transaction that writes the rows. This only checks shape.
 *
 * An empty list is valid and meaningful: it takes someone off every rota, which
 * is what you do the day before someone leaves.
 */
export const staffLeadServicesSchema = z.object({
  staffId: z.coerce.number().int().positive(),
  serviceIds: z.array(z.coerce.number().int().positive()).max(20),
});
export type StaffLeadServicesInput = z.infer<typeof staffLeadServicesSchema>;

/**
 * Create an office account from the panel (§10.1). The in-panel twin of
 * `npm run db:create-staff` — the CLI stays, because it is the only way to make
 * the FIRST admin on a fresh VPS, but day-to-day account creation should not
 * require a shell on the server.
 *
 * NO PASSWORD FIELD ON PURPOSE. A handover password is generated server-side and
 * shown once, exactly like an admin reset — an admin typing a colleague's first
 * password is the "Welcome123 on a sticky note" failure the reset flow already
 * avoids. `password_must_change` is set, so it dies at their first sign-in.
 *
 * Email is lowercased to match `staffLoginSchema` and the CLI, so a duplicate is
 * caught on the same normalised value login will look up.
 */
export const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["ops", "admin"]).default("ops"),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/** Deactivate or reactivate an office account (§10.4 offboarding). */
export const setStaffActiveSchema = z.object({
  staffId: z.coerce.number().int().positive(),
  isActive: z.boolean(),
});
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;

/**
 * The customer-directory filters (admin only). Parsed straight from the URL
 * search params, so every field is optional and coerced — a bookmarked or
 * hand-edited query must degrade to "show everything", never throw. The same
 * schema feeds the list page and the export route, so the spreadsheet is always
 * the exact set the admin was looking at.
 */
export const customerFilterSchema = z.object({
  /** Free text over name / phone / email. */
  q: z.string().trim().max(100).optional().catch(undefined),
  locale: z.enum(["bn", "en"]).optional().catch(undefined),
  /** Registration date window, inclusive, as Dhaka calendar days (YYYY-MM-DD). */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  hasBookings: z.enum(["yes", "no"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type CustomerFilter = z.infer<typeof customerFilterSchema>;
