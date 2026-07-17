import "server-only";

import { and, count, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { leadActivities, leads, services } from "../db/schema";
import { formatLeadCode } from "../../shared/booking-code";
import { pickLeadOwner } from "./assignment";
import {
  CLOSED_STAGES,
  DORMANCY_DAYS,
  initialNextActionAt,
  stageChangeActivity,
  validateStageChange,
} from "../../shared/leads";
import type { LeadStage } from "../../shared/leads";
import type { CreateLeadInput, UpdateLeadInput } from "../../shared/lead-schemas";

/**
 * Lead writes (PRD §9, module 06).
 *
 * No slot claim, no dispatch, no capacity race — a lead has none of that (§3.2).
 * The only invariants worth a transaction here are: an enquiry must target a
 * `lead`-archetype service, and **a stage change must never be silent** (AC-3).
 */

/** Enquiry against a non-`lead` service, e.g. someone POSTs nursing (§11). */
export class WrongArchetypeError extends Error {
  constructor(readonly archetype: string) {
    super(`Service archetype is "${archetype}", not "lead".`);
  }
}

export class LeadNotFoundError extends Error {}

/** Stage move rejected by the pipeline rules (reopen, no lost reason, …). */
export class InvalidStageChangeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Create a lead from a public enquiry or an Ops phone call (Flow C).
 *
 * Lands at stage `new` with a follow-up date already set — an enquiry nobody
 * has claimed still surfaces tomorrow rather than resting at `new` forever.
 *
 * The owner is picked by **round-robin within the service** (Ops decision,
 * 2026-07-17 — see `assignment.ts` for why it is not by zone). When nobody is
 * mapped to the service, `ownerId` stays null and the Kanban shows "Unassigned"
 * honestly, exactly as it did before there was a rota — the follow-up date is
 * what stops it going silent either way.
 *
 * Duplicates are NOT merged here (§11) — they are surfaced to the owner by the
 * Kanban query, because two enquiries from one phone can be two real people
 * (a son enquiring for both parents) and auto-merging destroys one of them.
 */
export async function createLead(input: CreateLeadInput, now: Date = new Date()) {
  return getDb().transaction(async (tx) => {
    // The archetype gate: this endpoint creates CRM leads, never bookings.
    const [service] = await tx
      .select({ id: services.id, archetype: services.archetype })
      .from(services)
      .where(eq(services.id, input.serviceId))
      .limit(1);

    if (!service) throw new WrongArchetypeError("unknown");
    if (service.archetype !== "lead") throw new WrongArchetypeError(service.archetype);

    // Daily sequence → lead code (same convention as booking codes, §7.2).
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const [{ c }] = await tx
      .select({ c: count() })
      .from(leads)
      .where(gte(leads.createdAt, startOfDay));

    // Inside the transaction, so the rotation reads the same committed state the
    // insert writes into.
    const ownerId = await pickLeadOwner(tx, input.serviceId);

    const [lead] = await tx
      .insert(leads)
      .values({
        leadCode: formatLeadCode(Number(c) + 1, now),
        serviceId: input.serviceId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        patientAge: input.patientAge,
        conditionSummary: input.conditionSummary,
        destinationPref: input.destinationPref,
        budgetRange: input.budgetRange,
        documents: input.documents,
        stage: "new",
        ownerId,
        nextActionAt: initialNextActionAt(now),
      })
      .returning({
        id: leads.id,
        leadCode: leads.leadCode,
        stage: leads.stage,
        ownerId: leads.ownerId,
        nextActionAt: leads.nextActionAt,
      });

    return lead;
  });
}

export interface UpdateLeadResult {
  id: number;
  stage: LeadStage;
  nextActionAt: Date | null;
}

/**
 * Update a lead and log what happened, in one transaction (AC-3.1).
 *
 * A stage change ALWAYS writes a `lead_activity` — the audit trail is not
 * optional and not the caller's responsibility to remember. Ops may also log an
 * activity on its own (a call that changed nothing is still contact, and it is
 * what resets the dormancy clock).
 */
export async function updateLead(
  leadId: number,
  input: UpdateLeadInput,
  actorId: number,
  now: Date = new Date(),
): Promise<UpdateLeadResult> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!existing) throw new LeadNotFoundError(`Lead ${leadId} not found.`);

    if (input.stage !== undefined) {
      const check = validateStageChange({
        from: existing.stage,
        to: input.stage,
        lostReason: input.lostReason,
      });
      if (!check.ok) throw new InvalidStageChangeError(check.code, check.message);
    }

    const [updated] = await tx
      .update(leads)
      .set({
        ...(input.stage !== undefined ? { stage: input.stage } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.nextActionAt !== undefined ? { nextActionAt: input.nextActionAt } : {}),
        ...(input.estimatedValue !== undefined
          ? { estimatedValue: input.estimatedValue.toFixed(2) }
          : {}),
        ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
        updatedAt: now,
      })
      .where(eq(leads.id, leadId))
      .returning({ id: leads.id, stage: leads.stage, nextActionAt: leads.nextActionAt });

    // A stage change is never silent (AC-3.1); an explicit note is additional.
    const entries: { type: string; summary: string }[] = [];
    if (input.stage !== undefined) {
      entries.push(
        stageChangeActivity({
          from: existing.stage,
          to: input.stage,
          lostReason: input.lostReason,
        }),
      );
    }
    if (input.activity) entries.push(input.activity);

    if (entries.length) {
      await tx.insert(leadActivities).values(
        entries.map((e) => ({
          leadId,
          actorId,
          type: e.type,
          summary: e.summary,
          occurredAt: now,
        })),
      );
    }

    return updated;
  });
}

/**
 * Sweep silent leads to `dormant` (§12.1) — a scheduled job on the VPS (BullMQ
 * + Redis, §3.4), exposed here as a plain function so it stays testable.
 *
 * "Silent" is measured from the last activity, falling back to creation for a
 * lead nobody ever touched. Closed leads are skipped: won/lost is an outcome,
 * not silence. The move logs an activity like any other stage change, so a
 * dormant lead shows WHY it went quiet.
 */
export async function sweepDormantLeads(actorId: number, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - DORMANCY_DAYS * 86_400_000);

  return getDb().transaction(async (tx) => {
    const lastActivity = tx
      .select({
        leadId: leadActivities.leadId,
        lastAt: sql<Date>`max(${leadActivities.occurredAt})`.as("last_at"),
      })
      .from(leadActivities)
      .groupBy(leadActivities.leadId)
      .as("last_activity");

    const stale = await tx
      .select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .leftJoin(lastActivity, eq(lastActivity.leadId, leads.id))
      .where(
        and(
          ne(leads.stage, "dormant"),
          sql`${leads.stage} NOT IN ${CLOSED_STAGES}`,
          lt(sql`coalesce(${lastActivity.lastAt}, ${leads.createdAt})`, cutoff),
        ),
      );

    if (stale.length === 0) return { moved: 0 };

    const ids = stale.map((l) => l.id);
    await tx.update(leads).set({ stage: "dormant", updatedAt: now }).where(inArray(leads.id, ids));
    await tx.insert(leadActivities).values(
      stale.map((l) => ({
        leadId: l.id,
        actorId,
        ...stageChangeActivity({ from: l.stage, to: "dormant" as const }),
        occurredAt: now,
      })),
    );

    return { moved: stale.length };
  });
}
