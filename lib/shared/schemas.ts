import { z } from "zod";
import { BANGLA_UNICODE_MESSAGE, isUnicodeBangla } from "./bangla";

/**
 * Shared Zod schemas — the single source of truth (PRD §4.5, §10.3). Pages and
 * route handlers import the SAME schema, so a page can never send a shape the
 * handler rejects. Catalogue schemas live here in module 02; auth/booking/lead
 * schemas are added by their modules.
 */

/** A required Bangla text field that must be real Unicode Bangla (§18.1). */
export const banglaText = (max = 200) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isUnicodeBangla, { message: BANGLA_UNICODE_MESSAGE });

export const serviceArchetypeSchema = z.enum(["visit", "placement", "lead"]);
export type ServiceArchetype = z.infer<typeof serviceArchetypeSchema>;

export const caregiverSkillSchema = z.enum([
  "phlebotomist",
  "attendant",
  "nurse",
  "physiotherapist",
  "babysitter",
]);

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase kebab-case slug");

const priceBdt = z.coerce.number().positive().max(10_000_000);

/** A visit window bound — 24h "HH:MM". */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)")
  .optional();

const nameEn = z.string().trim().min(1).max(200);

// Every editable service field except the slug — the slug is the stable
// identifier the booking flow and URLs key on, so it is set once at create and
// never rewritten. Shared by create and update so the two cannot drift.
const serviceFields = {
  archetype: serviceArchetypeSchema,
  nameBn: banglaText(),
  nameEn,
  descriptionBn: banglaText(2000).optional(),
  descriptionEn: z.string().trim().max(2000).optional(),
  requiresPrescription: z.boolean().default(false),
  requiredSkill: caregiverSkillSchema.nullish(),
  windowStart: timeOfDay,
  windowEnd: timeOfDay,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
} as const;

// A `lead` service has no dispatch, so it never carries a required skill (§3.2).
const noSkillForLead = (s: { archetype: string; requiredSkill?: string | null }) =>
  s.archetype !== "lead" || !s.requiredSkill;
const noSkillForLeadMsg = {
  message: "Lead services cannot require a caregiver skill.",
  path: ["requiredSkill"],
};

export const createServiceSchema = z
  .object({ slug, ...serviceFields })
  .refine(noSkillForLead, noSkillForLeadMsg);
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

/** Edit an existing service. Everything but the slug, which is immutable. */
export const updateServiceSchema = z.object(serviceFields).refine(noSkillForLead, noSkillForLeadMsg);
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createVariantSchema = z.object({
  serviceId: z.number().int().positive(),
  nameBn: banglaText(),
  nameEn,
  priceBdt,
  durationMin: z.number().int().positive().max(1440).nullish(),
  isActive: z.boolean().default(true),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

/** Edit a nursing variant — its service is fixed once created. */
export const updateVariantSchema = z.object({
  nameBn: banglaText(),
  nameEn,
  priceBdt,
  durationMin: z.number().int().positive().max(1440).nullish(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

/** Create or rename a zone. */
export const zoneNameSchema = z.object({ name: z.string().trim().min(1).max(80) });
export type ZoneNameInput = z.infer<typeof zoneNameSchema>;

/** A per-zone price override for a variant (§7.1). */
export const variantZonePriceSchema = z.object({
  variantId: z.number().int().positive(),
  zoneId: z.number().int().positive(),
  priceBdt,
});
export type VariantZonePriceInput = z.infer<typeof variantZonePriceSchema>;

/** Activate / deactivate a catalogue row. Deactivation is the only "delete" — a
 * row a booking or price may reference is never hard-deleted. */
export const setActiveSchema = z.object({ isActive: z.boolean() });
export type SetActiveInput = z.infer<typeof setActiveSchema>;
