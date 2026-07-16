import type { ServiceArchetype } from "./schemas";
import { SERVICE_SEED, ZONES } from "./catalogue-seed";

/**
 * Landing-page view of the catalogue. Derived from the single seed source
 * (catalogue-seed.ts) so there is exactly one service list in the codebase.
 *
 * TEMPORARY: still static. Module 09 replaces this read with `GET
 * /api/v1/services` off the live `services` table. The `archetype` decides the
 * CTA target: `lead` → /enquiry/[slug], everything else → /book/[slug]/select.
 */
export type { ServiceArchetype };

export interface CatalogueService {
  slug: string;
  archetype: ServiceArchetype;
  nameBn: string;
  nameEn: string;
  active: boolean;
}

export const SERVICES: CatalogueService[] = SERVICE_SEED.map((s) => ({
  slug: s.slug,
  archetype: s.archetype,
  nameBn: s.nameBn,
  nameEn: s.nameEn,
  active: s.isActive,
}));

/** The five launch zones follow the office, not ambition (PRD §3.1). */
export const LAUNCH_ZONES = [...ZONES];

export const HOTLINE = "01335995555";
export const HOTLINE_TEL = "+8801335995555";

/** Where a service tile links, based on its archetype. */
export function serviceHref(service: CatalogueService): string {
  return service.archetype === "lead"
    ? `/enquiry/${service.slug}`
    : `/book/${service.slug}/select`;
}
