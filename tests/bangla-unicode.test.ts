import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnicodeBangla } from "../lib/shared/bangla.ts";
import { createServiceSchema } from "../lib/shared/schemas.ts";

/**
 * Module 02 AC-2 (PRD §13 AC-7.4): inserting Bijoy/ANSI text into a *_bn field
 * is rejected; real Unicode Bangla passes. Mirrors the DB CHECK on
 * services.name_bn / service_variants.name_bn.
 */

test("real Unicode Bangla is accepted", () => {
  assert.equal(isUnicodeBangla("উন্নত ও মানসম্মত স্বাস্থ্যসেবা"), true);
  assert.equal(isUnicodeBangla("হোম প্যাথলজি"), true);
  assert.equal(isUnicodeBangla("নার্সিং সার্ভিস"), true);
});

test("Bijoy/ANSI mojibake is rejected", () => {
  // The tagline as it extracts from the Bijoy-encoded leaflet PDF (PRD §18.1).
  assert.equal(isUnicodeBangla("DbœZ I gvbm¤§Z m¦v¯'¨‡mev"), false);
});

test("pure Latin / empty is rejected", () => {
  assert.equal(isUnicodeBangla("Home Pathology"), false);
  assert.equal(isUnicodeBangla(""), false);
  assert.equal(isUnicodeBangla("   "), false);
});

test("a few Latin characters mixed into Bangla are allowed", () => {
  assert.equal(isUnicodeBangla("COVID টেস্ট"), true);
});

test("createServiceSchema rejects a Bijoy name_bn", () => {
  const result = createServiceSchema.safeParse({
    slug: "home-pathology",
    archetype: "visit",
    nameBn: "DbœZ I gvbm¤§Z", // Bijoy
    nameEn: "Home Pathology",
  });
  assert.equal(result.success, false);
});

test("createServiceSchema accepts a valid Unicode service", () => {
  const result = createServiceSchema.safeParse({
    slug: "home-pathology",
    archetype: "visit",
    nameBn: "হোম প্যাথলজি",
    nameEn: "Home Pathology",
  });
  assert.equal(result.success, true);
});

test("createServiceSchema forbids a required skill on a lead service", () => {
  const result = createServiceSchema.safeParse({
    slug: "medical-tourism",
    archetype: "lead",
    nameBn: "মেডিকেল ট্যুরিজম",
    nameEn: "Medical Tourism",
    requiredSkill: "nurse",
  });
  assert.equal(result.success, false);
});
