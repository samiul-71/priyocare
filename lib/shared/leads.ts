/**
 * Lead pipeline logic (PRD §3.2, §9, §12.1 · module 06).
 *
 * The framing that matters: **a lead is not a booking.** It runs for weeks or
 * months as a CRM pipeline, so there is no slot, no dispatch, no caregiver, no
 * check-in and no SLA timer anywhere in this file. Forcing leads into
 * `bookings` produces a mess nobody untangles (§3.2). Keep it that way.
 *
 * Pure and framework-agnostic: the Kanban page, the enquiry form and the route
 * handlers all share these rules, so they cannot drift.
 */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "dormant",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

/** Columns Ops actually works, left to right. `dormant` is surfaced separately. */
export const PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
] as const;

/** Nothing more happens to a lead in these stages — they leave the pipeline. */
export const CLOSED_STAGES = ["won", "lost"] as const;

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  dormant: "Dormant",
};

export const LEAD_ACTIVITY_TYPES = ["call", "whatsapp", "email", "meeting", "note"] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

/** A lead silent this long auto-moves to `dormant` and is re-surfaced (§12.1). */
export const DORMANCY_DAYS = 30;

/**
 * Every new enquiry gets a follow-up date this far out, so an unclaimed lead
 * surfaces as overdue tomorrow instead of resting quietly at stage `new`
 * forever. §1: "a lead is never allowed to go silent."
 */
export const FIRST_FOLLOW_UP_HOURS = 24;

export function initialNextActionAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + FIRST_FOLLOW_UP_HOURS * 3_600_000);
}

export function isClosed(stage: LeadStage): boolean {
  return (CLOSED_STAGES as readonly string[]).includes(stage);
}

/**
 * Overdue = the follow-up date has passed and the lead is still live (§9).
 * A won/lost lead is never overdue — there is nothing left to chase, and
 * pinning closed leads would train Ops to ignore the marker.
 */
export function isOverdue(
  lead: { stage: LeadStage; nextActionAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (isClosed(lead.stage)) return false;
  return lead.nextActionAt !== null && lead.nextActionAt.getTime() <= now.getTime();
}

/**
 * Has a live lead gone quiet for DORMANCY_DAYS? Measured from the last contact
 * (latest activity, else creation) — NOT from `next_action_at`, which may never
 * have been set. Closed leads are not dormant; they are finished.
 */
export function shouldGoDormant(
  lead: { stage: LeadStage; lastActivityAt: Date },
  now: Date = new Date(),
): boolean {
  if (isClosed(lead.stage) || lead.stage === "dormant") return false;
  const silentMs = now.getTime() - lead.lastActivityAt.getTime();
  return silentMs >= DORMANCY_DAYS * 86_400_000;
}

/** Whole days a lead has been silent — for the "quiet 12d" hint on a card. */
export function daysSilent(lastActivityAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - lastActivityAt.getTime()) / 86_400_000);
}

export interface StageChange {
  from: LeadStage;
  to: LeadStage;
  lostReason?: string | null;
}

export type StageChangeResult =
  | { ok: true }
  | { ok: false; code: "same_stage" | "reopen_closed" | "lost_reason_required"; message: string };

/**
 * Is this stage move allowed? Deliberately permissive about ORDER — Ops skips
 * steps all the time (a caller who already has a quote goes straight to
 * negotiating) and a Kanban that fights them gets worked around. It is strict
 * about the two things that lose information:
 *
 *   - reopening a won/lost lead, which would silently rewrite history; the
 *     answer to "they called back" is a new lead, not resurrection
 *   - marking lost without a reason (§6 Flow C) — an unexplained loss teaches
 *     nobody anything, and lost_reason is the only field that ever will
 */
export function validateStageChange(change: StageChange): StageChangeResult {
  const { from, to, lostReason } = change;

  if (from === to) {
    return { ok: false, code: "same_stage", message: "The lead is already in that stage." };
  }
  if (isClosed(from)) {
    return {
      ok: false,
      code: "reopen_closed",
      message: `A ${from} lead cannot be reopened — create a new lead instead.`,
    };
  }
  if (to === "lost" && !lostReason?.trim()) {
    return {
      ok: false,
      code: "lost_reason_required",
      message: "A reason is required to mark a lead lost.",
    };
  }
  return { ok: true };
}

/** The activity a stage change writes automatically (AC-3 — never silent). */
export function stageChangeActivity(change: StageChange): {
  type: LeadActivityType;
  summary: string;
} {
  const base = `Stage: ${STAGE_LABEL[change.from]} → ${STAGE_LABEL[change.to]}`;
  return {
    type: "note",
    summary: change.to === "lost" && change.lostReason
      ? `${base} (${change.lostReason.trim()})`
      : base,
  };
}

export interface KanbanLead {
  id: number;
  stage: LeadStage;
  nextActionAt: Date | null;
}

/**
 * Order within a Kanban column: **overdue follow-ups pin to the top** (AC-1.1),
 * then the soonest next action, then leads with no follow-up date at all, and
 * oldest-first inside each band so nothing rots quietly at the bottom.
 *
 * This is the module's whole point — "a lead is never allowed to go silent"
 * (§1). Ranking is pure so it is testable without a database, and the
 * `(stage, next_action_at)` index feeds it the rows already ordered.
 */
export function sortForKanban<T extends KanbanLead>(leads: T[], now: Date = new Date()): T[] {
  return [...leads].sort((a, b) => {
    const aOverdue = isOverdue(a, now);
    const bOverdue = isOverdue(b, now);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    // Undated leads sink below dated ones — a date is a commitment.
    if (a.nextActionAt === null || b.nextActionAt === null) {
      if (a.nextActionAt === b.nextActionAt) return a.id - b.id;
      return a.nextActionAt === null ? 1 : -1;
    }

    const diff = a.nextActionAt.getTime() - b.nextActionAt.getTime();
    return diff !== 0 ? diff : a.id - b.id;
  });
}

/** Count of overdue leads — the number Ops needs before anything else. */
export function countOverdue(leads: KanbanLead[], now: Date = new Date()): number {
  return leads.filter((l) => isOverdue(l, now)).length;
}
