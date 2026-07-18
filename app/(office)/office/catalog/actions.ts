"use server";

import { revalidatePath } from "next/cache";
import { getStaffActor } from "@/lib/server/auth/dal";
import {
  createService,
  createVariant,
  createZone,
  deleteVariantZonePrice,
  setServiceActive,
  setVariantActive,
  setZoneActive,
  updateService,
  updateVariant,
  updateZone,
  upsertVariantZonePrice,
} from "@/lib/server/office/catalogue";
import {
  createServiceSchema,
  createVariantSchema,
  setActiveSchema,
  updateServiceSchema,
  updateVariantSchema,
  variantZonePriceSchema,
  zoneNameSchema,
} from "@/lib/shared/schemas";

/**
 * Catalogue editing (§7.1) — ADMIN ONLY. Every action re-checks the actor and
 * refuses `ops`; the page hides the controls, but a Server Action is a public
 * HTTP endpoint, so the hide is a courtesy on top of the gate, never the gate.
 * Prices here feed live booking pricing (`createBooking` re-validates against
 * them), which is exactly why this is the highest-trust surface in the panel.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fields?: Record<string, string[]> };

const REVALIDATE = "/office/catalog";

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getStaffActor();
  if (!actor) return { ok: false, error: "Your session expired — sign in again." };
  if (actor.role !== "admin") return { ok: false, error: "Only an admin can edit the catalogue." };
  return { ok: true };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) (fields[issue.path.join(".") || "_"] ??= []).push(issue.message);
  return fields;
}

const invalid = (issues: { path: PropertyKey[]; message: string }[]): ActionResult => ({
  ok: false,
  error: "Check the highlighted fields.",
  fields: fieldErrors(issues),
});

/* --------------------------------------------------------------- services */

export async function createServiceAction(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = createServiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const result = await createService(parsed.data);
  if (!result.ok) {
    return { ok: false, error: "A service with that slug already exists.", fields: { slug: ["Already in use."] } };
  }
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function updateServiceAction(id: number, input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = updateServiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const ok = await updateService(id, parsed.data);
  if (!ok) return { ok: false, error: "That service no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function setServiceActiveAction(id: number, isActive: boolean): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = setActiveSchema.safeParse({ isActive });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ok = await setServiceActive(id, parsed.data.isActive);
  if (!ok) return { ok: false, error: "That service no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/* --------------------------------------------------------------- variants */

export async function createVariantAction(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const result = await createVariant(parsed.data);
  if (!result.ok) return { ok: false, error: "That service no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function updateVariantAction(id: number, input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = updateVariantSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const ok = await updateVariant(id, parsed.data);
  if (!ok) return { ok: false, error: "That procedure no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function setVariantActiveAction(id: number, isActive: boolean): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = setActiveSchema.safeParse({ isActive });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ok = await setVariantActive(id, parsed.data.isActive);
  if (!ok) return { ok: false, error: "That procedure no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/* ------------------------------------------------------------ zone prices */

export async function upsertVariantZonePriceAction(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = variantZonePriceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  await upsertVariantZonePrice(parsed.data.variantId, parsed.data.zoneId, parsed.data.priceBdt);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function deleteVariantZonePriceAction(
  variantId: number,
  zoneId: number,
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  await deleteVariantZonePrice(variantId, zoneId);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/* --------------------------------------------------------------- zones */

export async function createZoneAction(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = zoneNameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  await createZone(parsed.data.name);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function updateZoneAction(id: number, input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = zoneNameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const ok = await updateZone(id, parsed.data.name);
  if (!ok) return { ok: false, error: "That zone no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function setZoneActiveAction(id: number, isActive: boolean): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = setActiveSchema.safeParse({ isActive });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ok = await setZoneActive(id, parsed.data.isActive);
  if (!ok) return { ok: false, error: "That zone no longer exists." };
  revalidatePath(REVALIDATE);
  return { ok: true };
}
