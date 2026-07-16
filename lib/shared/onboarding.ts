/**
 * Caregiver onboarding gate (PRD §12.2). A caregiver cannot be activated (and
 * cannot appear in dispatch or receive a login PIN) until all mandatory steps
 * are complete AND a bKash payout number is on file. Enforced by the API, not a
 * UI hide (AC 2.1, 2.2).
 *
 * Babysitters carry two extra mandatory steps — the highest-consequence thing
 * the company does — plus called references and safeguarding training.
 */

export const REQUIRED_STEPS = [
  "nid",
  "photo",
  "police_clearance",
  "skill_cert",
  "interview",
] as const;

export const BABYSITTER_EXTRA_STEPS = ["references", "safeguarding"] as const;

export interface ActivationInput {
  skill: string;
  completedSteps: string[];
  payoutNumber: string | null;
  /** required when skill === 'nurse' (BNMC registration) */
  bnmcRegNo?: string | null;
}

export interface ActivationResult {
  canActivate: boolean;
  missing: string[];
}

export function requiredStepsFor(skill: string): string[] {
  return skill === "babysitter"
    ? [...REQUIRED_STEPS, ...BABYSITTER_EXTRA_STEPS]
    : [...REQUIRED_STEPS];
}

export function evaluateActivation(input: ActivationInput): ActivationResult {
  const completed = new Set(input.completedSteps);
  const missing = requiredStepsFor(input.skill).filter((s) => !completed.has(s));

  if (input.skill === "nurse" && !input.bnmcRegNo) missing.push("bnmc_reg_no");
  if (!input.payoutNumber) missing.push("bkash_payout_number");

  return { canActivate: missing.length === 0, missing };
}

/** Babysitters auto-suspend at 2 low ratings; everyone else at 3 (§12.2). */
export function lowRatingSuspendThreshold(skill: string): number {
  return skill === "babysitter" ? 2 : 3;
}
