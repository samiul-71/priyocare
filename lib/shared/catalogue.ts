/**
 * Static catalogue constants for the landing page (module 01).
 *
 * TEMPORARY: these are hardcoded from the leaflet (PRD §3.3) so the landing
 * page has content before the database exists. Module 02 replaces this with
 * the live `services` table read via `GET /api/v1/services`. Keep the shape
 * close to the DB so the swap is mechanical.
 *
 * Bangla is Unicode (design.md §8). The `archetype` decides the CTA target:
 * `lead` → /enquiry/[slug], everything else → /book/[slug]/select.
 */
export type ServiceArchetype = "visit" | "placement" | "lead";

export interface CatalogueService {
  slug: string;
  archetype: ServiceArchetype;
  nameBn: string;
  nameEn: string;
  active: boolean;
}

export const SERVICES: CatalogueService[] = [
  { slug: "home-pathology", archetype: "visit", nameBn: "হোম প্যাথলজি", nameEn: "Home Pathology", active: true },
  { slug: "nursing", archetype: "visit", nameBn: "নার্সিং সার্ভিস", nameEn: "Nursing", active: true },
  { slug: "caregiver", archetype: "placement", nameBn: "কেয়ারগিভার", nameEn: "Caregiver Service", active: true },
  { slug: "physiotherapy", archetype: "visit", nameBn: "ফিজিওথেরাপি", nameEn: "Physiotherapy", active: false },
  { slug: "babysitter", archetype: "placement", nameBn: "বেবিসিটার", nameEn: "Babysitter", active: false },
  { slug: "mental-health", archetype: "lead", nameBn: "মেন্টাল হেলথ কাউন্সিলিং", nameEn: "Mental Health", active: false },
  { slug: "health-insurance", archetype: "lead", nameBn: "হেল্থ ইন্স্যুরেন্স", nameEn: "Health Insurance", active: true },
  { slug: "medical-tourism", archetype: "lead", nameBn: "মেডিকেল ট্যুরিজম", nameEn: "Medical Tourism", active: true },
];

/** The five launch zones follow the office, not ambition (PRD §3.1). */
export const LAUNCH_ZONES = ["Mirpur DOHS", "Mirpur", "Pallabi", "Uttara", "Gulshan"];

export const HOTLINE = "01335995555";
export const HOTLINE_TEL = "+8801335995555";

/** Where a service tile links, based on its archetype. */
export function serviceHref(service: CatalogueService): string {
  return service.archetype === "lead"
    ? `/enquiry/${service.slug}`
    : `/book/${service.slug}/select`;
}
