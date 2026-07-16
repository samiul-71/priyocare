import type { ServiceArchetype } from "./schemas";

/**
 * Canonical catalogue seed (PRD §3.3). Plain data, no secrets — safe in
 * `lib/shared`, so it is the single source used by BOTH the seed CLI
 * (`lib/server/db/seed.ts`, which writes it to Postgres) and the read-only
 * `/office/catalog` view (until the live DB is wired through the API).
 *
 * Hard rule (PRD §7.1): once the DB is live, adding a service/variant/price is
 * an Ops task in /office/catalog — never a code deploy. This file only
 * bootstraps the initial state.
 */

export const ZONES = [
  "Mirpur DOHS",
  "Mirpur",
  "Pallabi",
  "Uttara",
  "Gulshan",
] as const;

export type CaregiverSkill =
  | "phlebotomist"
  | "attendant"
  | "nurse"
  | "physiotherapist"
  | "babysitter";

export interface ServiceSeed {
  slug: string;
  archetype: ServiceArchetype;
  nameBn: string;
  nameEn: string;
  requiresPrescription: boolean;
  requiredSkill: CaregiverSkill | null;
  windowStart?: string; // HH:MM, visit services with a fixed window
  windowEnd?: string;
  isActive: boolean;
  sortOrder: number;
}

// The eight service lines from the leaflet. Physiotherapy, Babysitter, and
// Mental Health ship inactive — blocked on Phase 2/3 gates (PRD §3.3, §10.6, §12.2).
export const SERVICE_SEED: ServiceSeed[] = [
  { slug: "home-pathology", archetype: "visit", nameBn: "হোম প্যাথলজি", nameEn: "Home Pathology", requiresPrescription: false, requiredSkill: "phlebotomist", windowStart: "06:00", windowEnd: "11:00", isActive: true, sortOrder: 1 },
  { slug: "nursing", archetype: "visit", nameBn: "নার্সিং সার্ভিস", nameEn: "Nursing", requiresPrescription: true, requiredSkill: "nurse", isActive: true, sortOrder: 2 },
  { slug: "caregiver", archetype: "placement", nameBn: "কেয়ারগিভার", nameEn: "Caregiver Service", requiresPrescription: false, requiredSkill: "attendant", isActive: true, sortOrder: 3 },
  { slug: "physiotherapy", archetype: "visit", nameBn: "ফিজিওথেরাপি", nameEn: "Physiotherapy", requiresPrescription: false, requiredSkill: "physiotherapist", isActive: false, sortOrder: 4 },
  { slug: "babysitter", archetype: "placement", nameBn: "বেবিসিটার", nameEn: "Babysitter", requiresPrescription: false, requiredSkill: "babysitter", isActive: false, sortOrder: 5 },
  { slug: "mental-health", archetype: "lead", nameBn: "মেন্টাল হেলথ কাউন্সিলিং", nameEn: "Mental Health", requiresPrescription: false, requiredSkill: null, isActive: false, sortOrder: 6 },
  { slug: "health-insurance", archetype: "lead", nameBn: "হেল্থ ইন্স্যুরেন্স", nameEn: "Health Insurance", requiresPrescription: false, requiredSkill: null, isActive: true, sortOrder: 7 },
  { slug: "medical-tourism", archetype: "lead", nameBn: "মেডিকেল ট্যুরিজম", nameEn: "Medical Tourism", requiresPrescription: false, requiredSkill: null, isActive: true, sortOrder: 8 },
];

export interface VariantSeed {
  serviceSlug: string;
  nameBn: string;
  nameEn: string;
  priceBdt: number;
  durationMin?: number;
}

// The 15 nursing procedures — VARIANTS under the one "Nursing" service (§3.3).
export const NURSING_VARIANTS: VariantSeed[] = [
  { serviceSlug: "nursing", nameBn: "ডিপ মাসল ইনজেকশন", nameEn: "Deep Muscle Injection", priceBdt: 400, durationMin: 20 },
  { serviceSlug: "nursing", nameBn: "আইএম ইনজেকশন", nameEn: "IM Injection", priceBdt: 300, durationMin: 15 },
  { serviceSlug: "nursing", nameBn: "আইভি ইনজেকশন", nameEn: "IV Injection", priceBdt: 400, durationMin: 20 },
  { serviceSlug: "nursing", nameBn: "আইভি ক্যানুলা", nameEn: "IV Cannula", priceBdt: 500, durationMin: 25 },
  { serviceSlug: "nursing", nameBn: "আইভি স্যালাইন ইনফিউশন", nameEn: "IV Saline Infusion", priceBdt: 600, durationMin: 45 },
  { serviceSlug: "nursing", nameBn: "ইউরিন ক্যাথেটার সেটআপ", nameEn: "Urine Catheter Setup", priceBdt: 800, durationMin: 30 },
  { serviceSlug: "nursing", nameBn: "প্লেইন ক্যাথেটার সেটআপ", nameEn: "Plain Catheter Setup", priceBdt: 700, durationMin: 30 },
  { serviceSlug: "nursing", nameBn: "এনজি টিউব সেটআপ", nameEn: "NG Tube Setup", priceBdt: 900, durationMin: 30 },
  { serviceSlug: "nursing", nameBn: "নেবুলাইজেশন", nameEn: "Nebulization", priceBdt: 350, durationMin: 20 },
  { serviceSlug: "nursing", nameBn: "জেনারেল ড্রেসিং", nameEn: "General Dressing", priceBdt: 400, durationMin: 25 },
  { serviceSlug: "nursing", nameBn: "ফুট-কেয়ার ড্রেসিং", nameEn: "Foot-Care Dressing", priceBdt: 600, durationMin: 30 },
  { serviceSlug: "nursing", nameBn: "বেডসোর ড্রেসিং", nameEn: "Bedsore Dressing", priceBdt: 700, durationMin: 40 },
  { serviceSlug: "nursing", nameBn: "ব্লাড সুগার চেক", nameEn: "Blood Sugar Check", priceBdt: 200, durationMin: 10 },
  { serviceSlug: "nursing", nameBn: "পালস চেক", nameEn: "Pulse Check", priceBdt: 150, durationMin: 10 },
  { serviceSlug: "nursing", nameBn: "জেনারেল হেলথ চেকআপ", nameEn: "General Health Checkup", priceBdt: 500, durationMin: 30 },
];
