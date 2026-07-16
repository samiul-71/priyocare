import { z } from "zod";
import { bdPhone } from "./auth-schemas";
import { LEAD_ACTIVITY_TYPES, LEAD_STAGES } from "./leads";

/**
 * Lead request schemas (PRD §8, module 06). The SAME schemas guard the enquiry
 * form, the Kanban controls and the route handlers — no drift (§10.3).
 */

/**
 * A document attached to an enquiry. Medical reports are the sensitive case
 * (§11): they go to private storage behind a signed link, never a public path,
 * so only the storage KEY is accepted here — never a caller-supplied URL, which
 * would let anyone point a lead at any address. The upload endpoint that mints
 * these keys lands with the storage provider (§19); until then the form submits
 * no documents and this array stays empty.
 */
export const leadDocumentSchema = z.object({
  key: z.string().trim().min(1).max(300),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(100).optional(),
});
export type LeadDocument = z.infer<typeof leadDocumentSchema>;

/**
 * Public enquiry (`POST /api/v1/leads`). Deliberately short: this is Flow C's
 * front door and every extra required field costs enquiries. Name + phone are
 * all that is truly needed — Ops calls back for the rest.
 */
export const createLeadSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: bdPhone,
  patientAge: z.coerce.number().int().min(0).max(120).optional(),
  conditionSummary: z.string().trim().max(2000).optional(),
  destinationPref: z.string().trim().max(200).optional(), // medical tourism only
  budgetRange: z.string().trim().max(100).optional(),
  documents: z.array(leadDocumentSchema).max(10).default([]),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const leadStageSchema = z.enum(LEAD_STAGES);
export const leadActivityTypeSchema = z.enum(LEAD_ACTIVITY_TYPES);

/**
 * Ops update (`PATCH /api/v1/office/leads/{id}`). Every field is optional, but
 * an empty patch is meaningless — `.refine` below rejects it rather than
 * quietly writing a no-op activity.
 *
 * `stage` and `nextActionAt` are the two that carry the module's promises: a
 * stage change always logs an activity (AC-3), and a follow-up date is what
 * stops a lead going silent (§9).
 */
export const updateLeadSchema = z
  .object({
    stage: leadStageSchema.optional(),
    ownerId: z.coerce.number().int().positive().nullable().optional(),
    nextActionAt: z.coerce.date().nullable().optional(),
    estimatedValue: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
    lostReason: z.string().trim().min(1).max(500).optional(),
    activity: z
      .object({
        type: leadActivityTypeSchema,
        summary: z.string().trim().min(1).max(2000),
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "Nothing to update.",
  });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
