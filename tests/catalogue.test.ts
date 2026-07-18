import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServiceSchema,
  createVariantSchema,
  updateServiceSchema,
  updateVariantSchema,
  variantZonePriceSchema,
  zoneNameSchema,
} from "../lib/shared/schemas.ts";

/*
 * Catalogue editing (§7.1) — the shared schemas the page and the admin actions
 * both enforce (the DB writes are verified live). Two rules carry real weight:
 * *_bn fields must be Unicode Bangla (not Bijoy bytes, §18.1), and prices/skills
 * are validated before they ever reach live booking pricing.
 */

const validService = {
  slug: "home-pathology",
  archetype: "visit",
  nameBn: "হোম প্যাথলজি",
  nameEn: "Home Pathology",
  requiresPrescription: false,
  requiredSkill: "phlebotomist",
  isActive: true,
  sortOrder: 1,
};

test("a well-formed service passes, and defaults fill in", () => {
  const parsed = createServiceSchema.safeParse({ slug: "x-ray", archetype: "visit", nameBn: "এক্স-রে", nameEn: "X-Ray" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.isActive, true); // default
  assert.equal(parsed.data?.sortOrder, 0); // default
  assert.equal(parsed.data?.requiresPrescription, false);
});

test("a lead service may not require a caregiver skill (§3.2)", () => {
  const bad = createServiceSchema.safeParse({ ...validService, archetype: "lead", requiredSkill: "nurse" });
  assert.equal(bad.success, false);
  assert.match(String(bad.error?.issues[0]?.message), /Lead services cannot require/);
  const ok = createServiceSchema.safeParse({ ...validService, slug: "insurance", archetype: "lead", requiredSkill: null });
  assert.equal(ok.success, true);
});

test("the slug must be lowercase kebab-case", () => {
  assert.equal(createServiceSchema.safeParse({ ...validService, slug: "Home Pathology" }).success, false);
  assert.equal(createServiceSchema.safeParse({ ...validService, slug: "home_pathology" }).success, false);
  assert.equal(createServiceSchema.safeParse({ ...validService, slug: "home-pathology-2" }).success, true);
});

test("a Bangla name must be real Unicode Bangla, not Latin/Bijoy bytes (§18.1)", () => {
  assert.equal(createServiceSchema.safeParse({ ...validService, nameBn: "Home Pathology" }).success, false);
  assert.equal(createServiceSchema.safeParse({ ...validService, nameBn: "হোম প্যাথলজি" }).success, true);
});

test("visit windows must be HH:MM when given", () => {
  assert.equal(createServiceSchema.safeParse({ ...validService, windowStart: "6am" }).success, false);
  assert.equal(createServiceSchema.safeParse({ ...validService, windowStart: "06:00", windowEnd: "11:00" }).success, true);
  assert.equal(createServiceSchema.safeParse({ ...validService, windowStart: "25:00" }).success, false);
});

test("updateServiceSchema has no slug and keeps the lead/skill rule", () => {
  const parsed = updateServiceSchema.safeParse({ archetype: "visit", nameBn: "হোম প্যাথলজি", nameEn: "Home Pathology", isActive: true, sortOrder: 1 });
  assert.equal(parsed.success, true);
  assert.equal("slug" in (parsed.data ?? {}), false);
  assert.equal(updateServiceSchema.safeParse({ archetype: "lead", nameBn: "বীমা", nameEn: "Insurance", requiredSkill: "nurse" }).success, false);
});

test("variant price is coerced and must be positive; Bangla name enforced", () => {
  assert.equal(createVariantSchema.safeParse({ serviceId: 2, nameBn: "আইভি ইনজেকশন", nameEn: "IV Injection", priceBdt: "400" }).data?.priceBdt, 400);
  assert.equal(createVariantSchema.safeParse({ serviceId: 2, nameBn: "IV", nameEn: "IV", priceBdt: 400 }).success, false); // Latin bn
  assert.equal(createVariantSchema.safeParse({ serviceId: 2, nameBn: "আইভি", nameEn: "IV", priceBdt: -5 }).success, false);
  assert.equal(updateVariantSchema.safeParse({ nameBn: "আইভি", nameEn: "IV", priceBdt: 0 }).success, false);
});

test("zone names and per-zone prices validate", () => {
  assert.equal(zoneNameSchema.safeParse({ name: "Mirpur" }).success, true);
  assert.equal(zoneNameSchema.safeParse({ name: "" }).success, false);
  assert.equal(variantZonePriceSchema.safeParse({ variantId: 1, zoneId: 2, priceBdt: "650" }).data?.priceBdt, 650);
  assert.equal(variantZonePriceSchema.safeParse({ variantId: 0, zoneId: 2, priceBdt: 650 }).success, false);
  assert.equal(variantZonePriceSchema.safeParse({ variantId: 1, zoneId: 2, priceBdt: -1 }).success, false);
});
