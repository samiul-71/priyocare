import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import { serviceVariants, services, variantZonePrices, zones } from "../db/schema";
import type {
  CreateServiceInput,
  CreateVariantInput,
  UpdateServiceInput,
  UpdateVariantInput,
} from "../../shared/schemas";

/**
 * The service catalogue as an editable data source (PRD §7.1: adding a service,
 * variant, price, or zone is an Ops task in the panel, never a code deploy).
 *
 * READS the live `services` / `service_variants` / `variant_zone_prices` /
 * `zones` tables — not the seed constants the read-only page used to render, so
 * every edit here is what the page then shows. WRITES are admin-gated at the
 * action layer; these functions hold no gate of their own.
 *
 * Nothing is ever hard-deleted. A service or variant a booking may reference, or
 * a zone a price may hang off, is deactivated (`is_active=false`), which the
 * customer flows already exclude — deleting the row would orphan history.
 */

/* ------------------------------------------------------------------- reads */

export interface CatalogueService {
  id: number;
  slug: string;
  archetype: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  requiresPrescription: boolean;
  requiredSkill: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface CatalogueVariant {
  id: number;
  serviceId: number;
  nameBn: string;
  nameEn: string;
  priceBdt: string;
  durationMin: number | null;
  isActive: boolean;
}
export interface CatalogueZone {
  id: number;
  name: string;
  isActive: boolean;
}
export interface CatalogueZonePrice {
  variantId: number;
  zoneId: number;
  priceBdt: string;
}
export interface CatalogueData {
  services: CatalogueService[];
  variants: CatalogueVariant[];
  zones: CatalogueZone[];
  zonePrices: CatalogueZonePrice[];
}

const EMPTY: CatalogueData = { services: [], variants: [], zones: [], zonePrices: [] };

/** The whole catalogue, active and inactive — the admin needs to see and revive
 * a switched-off row, so nothing is filtered here. */
export async function getCatalogue(): Promise<CatalogueData> {
  if (!isDbConfigured()) return EMPTY;
  const db = getDb();
  const [serviceRows, variantRows, zoneRows, priceRows] = await Promise.all([
    db
      .select({
        id: services.id,
        slug: services.slug,
        archetype: services.archetype,
        nameBn: services.nameBn,
        nameEn: services.nameEn,
        descriptionBn: services.descriptionBn,
        descriptionEn: services.descriptionEn,
        requiresPrescription: services.requiresPrescription,
        requiredSkill: services.requiredSkill,
        windowStart: services.windowStart,
        windowEnd: services.windowEnd,
        isActive: services.isActive,
        sortOrder: services.sortOrder,
      })
      .from(services)
      .orderBy(asc(services.sortOrder), asc(services.id)),
    db
      .select({
        id: serviceVariants.id,
        serviceId: serviceVariants.serviceId,
        nameBn: serviceVariants.nameBn,
        nameEn: serviceVariants.nameEn,
        priceBdt: serviceVariants.priceBdt,
        durationMin: serviceVariants.durationMin,
        isActive: serviceVariants.isActive,
      })
      .from(serviceVariants)
      .orderBy(asc(serviceVariants.id)),
    db
      .select({ id: zones.id, name: zones.name, isActive: zones.isActive })
      .from(zones)
      .orderBy(asc(zones.id)),
    db
      .select({
        variantId: variantZonePrices.variantId,
        zoneId: variantZonePrices.zoneId,
        priceBdt: variantZonePrices.priceBdt,
      })
      .from(variantZonePrices),
  ]);
  return { services: serviceRows, variants: variantRows, zones: zoneRows, zonePrices: priceRows };
}

/* ------------------------------------------------------------- service writes */

export type CreateServiceResult =
  | { ok: true; id: number }
  | { ok: false; reason: "duplicate_slug" };

/** Create a service. The slug is the stable identifier, so a collision is
 * refused rather than silently suffixed. */
export async function createService(input: CreateServiceInput): Promise<CreateServiceResult> {
  const db = getDb();
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.slug, input.slug))
    .limit(1);
  if (existing) return { ok: false, reason: "duplicate_slug" };

  const [created] = await db
    .insert(services)
    .values({
      slug: input.slug,
      archetype: input.archetype,
      nameBn: input.nameBn,
      nameEn: input.nameEn,
      descriptionBn: input.descriptionBn ?? null,
      descriptionEn: input.descriptionEn ?? null,
      requiresPrescription: input.requiresPrescription,
      requiredSkill: input.requiredSkill ?? null,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    })
    .returning({ id: services.id });
  return { ok: true, id: created.id };
}

/** Edit a service — everything but the slug. */
export async function updateService(id: number, input: UpdateServiceInput): Promise<boolean> {
  const updated = await getDb()
    .update(services)
    .set({
      archetype: input.archetype,
      nameBn: input.nameBn,
      nameEn: input.nameEn,
      descriptionBn: input.descriptionBn ?? null,
      descriptionEn: input.descriptionEn ?? null,
      requiresPrescription: input.requiresPrescription,
      requiredSkill: input.requiredSkill ?? null,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    })
    .where(eq(services.id, id))
    .returning({ id: services.id });
  return updated.length > 0;
}

export async function setServiceActive(id: number, isActive: boolean): Promise<boolean> {
  const updated = await getDb()
    .update(services)
    .set({ isActive })
    .where(eq(services.id, id))
    .returning({ id: services.id });
  return updated.length > 0;
}

/* ------------------------------------------------------------- variant writes */

export type CreateVariantResult =
  | { ok: true; id: number }
  | { ok: false; reason: "service_not_found" };

export async function createVariant(input: CreateVariantInput): Promise<CreateVariantResult> {
  const db = getDb();
  const [svc] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1);
  if (!svc) return { ok: false, reason: "service_not_found" };

  const [created] = await db
    .insert(serviceVariants)
    .values({
      serviceId: input.serviceId,
      nameBn: input.nameBn,
      nameEn: input.nameEn,
      priceBdt: input.priceBdt.toFixed(2),
      durationMin: input.durationMin ?? null,
      isActive: input.isActive,
    })
    .returning({ id: serviceVariants.id });
  return { ok: true, id: created.id };
}

export async function updateVariant(id: number, input: UpdateVariantInput): Promise<boolean> {
  const updated = await getDb()
    .update(serviceVariants)
    .set({
      nameBn: input.nameBn,
      nameEn: input.nameEn,
      priceBdt: input.priceBdt.toFixed(2),
      durationMin: input.durationMin ?? null,
    })
    .where(eq(serviceVariants.id, id))
    .returning({ id: serviceVariants.id });
  return updated.length > 0;
}

export async function setVariantActive(id: number, isActive: boolean): Promise<boolean> {
  const updated = await getDb()
    .update(serviceVariants)
    .set({ isActive })
    .where(eq(serviceVariants.id, id))
    .returning({ id: serviceVariants.id });
  return updated.length > 0;
}

/* --------------------------------------------------------- per-zone price writes */

/** Set (or change) a variant's price in one zone. Upsert on the (variant, zone)
 * primary key — a repeat is an edit, not a duplicate. */
export async function upsertVariantZonePrice(
  variantId: number,
  zoneId: number,
  priceBdt: number,
): Promise<void> {
  const price = priceBdt.toFixed(2);
  await getDb()
    .insert(variantZonePrices)
    .values({ variantId, zoneId, priceBdt: price })
    .onConflictDoUpdate({
      target: [variantZonePrices.variantId, variantZonePrices.zoneId],
      set: { priceBdt: price },
    });
}

/** Remove a per-zone override, so the zone falls back to the variant's base price. */
export async function deleteVariantZonePrice(variantId: number, zoneId: number): Promise<void> {
  await getDb()
    .delete(variantZonePrices)
    .where(and(eq(variantZonePrices.variantId, variantId), eq(variantZonePrices.zoneId, zoneId)));
}

/* --------------------------------------------------------------- zone writes */

export async function createZone(name: string): Promise<number> {
  const [created] = await getDb().insert(zones).values({ name }).returning({ id: zones.id });
  return created.id;
}

export async function updateZone(id: number, name: string): Promise<boolean> {
  const updated = await getDb()
    .update(zones)
    .set({ name })
    .where(eq(zones.id, id))
    .returning({ id: zones.id });
  return updated.length > 0;
}

export async function setZoneActive(id: number, isActive: boolean): Promise<boolean> {
  const updated = await getDb()
    .update(zones)
    .set({ isActive })
    .where(eq(zones.id, id))
    .returning({ id: zones.id });
  return updated.length > 0;
}
