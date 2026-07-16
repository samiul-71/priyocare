/**
 * Complaint rules (PRD §9). A 1–2★ rating auto-creates a complaint within
 * seconds, pre-filled, no manual step — but the caregiver is NOT auto-suspended.
 * A "serious" tag (theft, rudeness, clinical error) instantly suspends them
 * from all dispatch and revokes their tokens (handled server-side).
 */

export const SERIOUS_TAGS = ["theft", "rudeness", "clinical_error"] as const;
export type SeriousTag = (typeof SERIOUS_TAGS)[number];

/** A 1–2★ rating triggers an auto-created complaint; 3★+ does not (AC 1.1/1.2). */
export function ratingTriggersComplaint(rating: number): boolean {
  return Number.isFinite(rating) && rating >= 1 && rating <= 2;
}

export function isSeriousTag(tag: string): tag is SeriousTag {
  return (SERIOUS_TAGS as readonly string[]).includes(tag);
}
