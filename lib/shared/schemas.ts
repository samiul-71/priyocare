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

export const createServiceSchema = z
  .object({
    slug,
    archetype: serviceArchetypeSchema,
    nameBn: banglaText(),
    nameEn: z.string().trim().min(1).max(200),
    descriptionBn: banglaText(2000).optional(),
    descriptionEn: z.string().trim().max(2000).optional(),
    requiresPrescription: z.boolean().default(false),
    requiredSkill: caregiverSkillSchema.nullish(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  // A `lead` service has no dispatch, so it never carries a required skill (§3.2).
  .refine((s) => s.archetype !== "lead" || !s.requiredSkill, {
    message: "Lead services cannot require a caregiver skill.",
    path: ["requiredSkill"],
  });
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const createVariantSchema = z.object({
  serviceId: z.number().int().positive(),
  nameBn: banglaText(),
  nameEn: z.string().trim().min(1).max(200),
  priceBdt,
  durationMin: z.number().int().positive().max(1440).nullish(),
  isActive: z.boolean().default(true),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
