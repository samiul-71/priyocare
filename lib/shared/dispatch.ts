/**
 * Dispatch eligibility (PRD §9). A caregiver is eligible only if approved, the
 * skill matches, the zone matches, and there is no time-window conflict; the
 * eligible set is then sorted by continuity of care ("served this patient
 * before", desc) then rating (desc).
 *
 * A caregiver missing even one onboarding step is `verification_status !=
 * 'approved'` and so **never appears** — enforced by this filter, not a UI hide
 * (AC 2.1). This is a pure function so it can be unit-tested and reused by the
 * dispatch handler and the assignment screen.
 */

export interface CaregiverForDispatch {
  id: number;
  verificationStatus: string;
  skill: string;
  zones: Array<string | number>;
  ratingAvg: number;
  /** existing assignments the caregiver is already committed to */
  busyWindows: Array<{ start: number; end: number }>;
  servedPatientBefore: boolean;
}

export interface DispatchCriteria {
  requiredSkill: string;
  zone: string | number;
  windowStart: number;
  windowEnd: number;
}

function overlaps(
  w: { start: number; end: number },
  c: DispatchCriteria,
): boolean {
  return w.start < c.windowEnd && c.windowStart < w.end;
}

export function rankEligibleCaregivers<T extends CaregiverForDispatch>(
  caregivers: T[],
  criteria: DispatchCriteria,
): T[] {
  return caregivers
    .filter((c) => c.verificationStatus === "approved")
    .filter((c) => c.skill === criteria.requiredSkill)
    .filter((c) => c.zones.includes(criteria.zone))
    .filter((c) => !c.busyWindows.some((w) => overlaps(w, criteria)))
    .sort(
      (a, b) =>
        Number(b.servedPatientBefore) - Number(a.servedPatientBefore) ||
        b.ratingAvg - a.ratingAvg,
    );
}
