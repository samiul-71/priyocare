import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import { serviceVariants, services, zones } from "../db/schema";

/**
 * Catalogue reads (PRD §7.1, module 09 §8). The one place that turns the
 * `services`/`service_variants` tables into the shape every surface consumes,
 * so the customer site, the office form and the API cannot disagree about what
 * exists or what it costs.
 */

export interface CatalogueVariant {
  id: number;
  nameEn: string;
  nameBn: string;
  priceBdt: number;
  durationMin: number | null;
}

export interface CatalogueService {
  id: number;
  slug: string;
  nameEn: string;
  nameBn: string;
  archetype: string;
  requiresPrescription: boolean;
  requiredSkill: string | null;
  /** False = phone-only. Still listed: Ops books these on the hotline (§3.1). */
  isActive: boolean;
  variants: CatalogueVariant[];
}

export async function listCatalogue(): Promise<CatalogueService[]> {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const rows = await db
    .select({
      id: services.id,
      slug: services.slug,
      nameEn: services.nameEn,
      nameBn: services.nameBn,
      archetype: services.archetype,
      requiresPrescription: services.requiresPrescription,
      requiredSkill: services.requiredSkill,
      isActive: services.isActive,
    })
    .from(services)
    .orderBy(asc(services.sortOrder));

  const variants = await db
    .select({
      id: serviceVariants.id,
      serviceId: serviceVariants.serviceId,
      nameEn: serviceVariants.nameEn,
      nameBn: serviceVariants.nameBn,
      priceBdt: serviceVariants.priceBdt,
      durationMin: serviceVariants.durationMin,
      isActive: serviceVariants.isActive,
    })
    .from(serviceVariants)
    .where(eq(serviceVariants.isActive, true))
    .orderBy(asc(serviceVariants.id));

  return rows.map((s) => ({
    ...s,
    variants: variants
      .filter((v) => v.serviceId === s.id)
      .map((v) => ({
        id: v.id,
        nameEn: v.nameEn,
        nameBn: v.nameBn,
        // numeric(10,2) arrives as a string; the wire contract is a number, so
        // every consumer does not have to remember to coerce it.
        priceBdt: Number(v.priceBdt),
        durationMin: v.durationMin,
      })),
  }));
}

/** Active zones — the coverage list a booking form offers. */
export async function listZones(): Promise<{ id: number; name: string }[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ id: zones.id, name: zones.name })
    .from(zones)
    .where(eq(zones.isActive, true))
    .orderBy(asc(zones.id));
}
