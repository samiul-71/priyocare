import "server-only";

import { and, eq, max } from "drizzle-orm";
import { leads, staffAccounts, staffServices } from "../db/schema";
import type { getDb } from "../db";

/**
 * Lead owner assignment (§9, Flow C's "+ owner"). Ops decision, 2026-07-17:
 * **round-robin by service.**
 *
 * NOT BY ZONE, though that was the first instinct. Zones are hyper-local
 * delivery areas (Mirpur, Gulshan…) whose whole purpose is sending a caregiver
 * to a house — and no lead involves a house. The three lead-archetype services
 * are health insurance (phone and paperwork), medical tourism (the patient flies
 * abroad; the lead carries a `destination_pref`) and mental-health counselling
 * (off-platform). `leads` has no zone, the enquiry form deliberately never asks
 * for one, and for medical tourism the answer would be noise. The service is the
 * real specialism: selling insurance, counselling a family in crisis and
 * coordinating a hospital transfer abroad are different jobs.
 *
 * WHY LEAST-RECENTLY-ASSIGNED RATHER THAN A COUNTER: a stored "next up" pointer
 * is a second source of truth that drifts — it needs resetting when staff join,
 * leave, or are deactivated, and nothing ever remembers to. Ordering by "who has
 * not had one for longest" derives the same rotation from facts already in the
 * table, and self-heals: a new staff member has never been assigned, so they go
 * first; a deactivated one simply stops appearing.
 */

export interface OwnerCandidate {
  staffId: number;
  /** When this staff member last got a lead FOR THIS SERVICE. Null = never. */
  lastAssignedAt: Date | null;
}

/**
 * Pure so the rotation is testable without a database — the part worth getting
 * right is the ordering, not the SQL.
 *
 * Never-assigned first, then oldest assignment, then id. The id tie-break is not
 * decoration: two staff who have never been assigned both sort equal on time, and
 * without it the winner would depend on row order, making the rotation
 * unpredictable and the tests flaky.
 */
export function pickNextOwner(candidates: OwnerCandidate[]): number | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    // -Infinity, not 0: "never assigned" must beat every real timestamp, and 0
    // is 1970 — a real date that a clock-skewed row could theoretically hold.
    const at = a.lastAssignedAt?.getTime() ?? -Infinity;
    const bt = b.lastAssignedAt?.getTime() ?? -Infinity;
    if (at !== bt) return at - bt;
    return a.staffId - b.staffId;
  })[0].staffId;
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The pool for a service: active staff mapped to it, with the last time each was
 * given a lead for that same service.
 *
 * Scoped per service on purpose. Someone who handles both insurance and medical
 * tourism has a separate rotation in each — a busy tourism week must not push
 * them to the back of the insurance queue, because those are different jobs and
 * the point is fair load within a specialism.
 */
export async function findOwnerCandidates(
  tx: Tx,
  serviceId: number,
): Promise<OwnerCandidate[]> {
  return tx
    .select({
      staffId: staffAccounts.id,
      lastAssignedAt: max(leads.createdAt),
    })
    .from(staffServices)
    .innerJoin(staffAccounts, eq(staffAccounts.id, staffServices.staffId))
    // LEFT join: a staff member with no leads yet must still appear, with a null
    // lastAssignedAt, so they sort first. An inner join would hide exactly the
    // person who is most owed the next lead.
    .leftJoin(
      leads,
      and(eq(leads.ownerId, staffAccounts.id), eq(leads.serviceId, serviceId)),
    )
    .where(and(eq(staffServices.serviceId, serviceId), eq(staffAccounts.isActive, true)))
    .groupBy(staffAccounts.id);
}

/**
 * Pick the owner for a new lead, or null when nobody handles the service.
 *
 * Null is a real answer, not a failure: with an empty mapping every lead falls
 * back to Unassigned with a follow-up date, which is precisely how the board
 * behaved before this existed. An enquiry is never dropped for want of a rota.
 *
 * CONCURRENCY: two leads for one service created at the same instant can both
 * see the same "least recent" staff and both land on them, because neither
 * transaction sees the other's uncommitted insert. That is fairness drift of one
 * lead, not a lost lead, and it self-corrects — that staff member is now the
 * most recently assigned, so they go last next time. Serialising this would mean
 * locking staff rows on a table that logins read, which is a much worse trade
 * for a handful of leads a day.
 */
export async function pickLeadOwner(tx: Tx, serviceId: number): Promise<number | null> {
  return pickNextOwner(await findOwnerCandidates(tx, serviceId));
}
