import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import { leadActivities, leads, services, staffAccounts } from "../db/schema";
import { sortForKanban } from "../../shared/leads";
import type { LeadStage } from "../../shared/leads";

/**
 * Lead reads for the Ops Kanban (PRD §5, §9, module 06).
 *
 * Empty-safe like the other office queries: with no DATABASE_URL these return
 * empty rather than throwing, so the page renders its empty state.
 */

export interface KanbanCard {
  id: number;
  leadCode: string;
  stage: LeadStage;
  contactName: string;
  contactPhone: string;
  serviceName: string;
  conditionSummary: string | null;
  ownerName: string | null;
  nextActionAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  /** Another live lead shares this phone (§11) — surfaced, never auto-merged. */
  possibleDuplicate: boolean;
}

/**
 * Every live lead, ordered for the board.
 *
 * `possibleDuplicate` is computed here rather than stored: a repeat caller is a
 * fact about the current data, not a property of the lead, and a stored flag
 * would go stale the moment the other lead closed. The window count is over
 * OPEN leads only, so a closed lead from last year never flags a new enquiry.
 */
export async function listLeadsForKanban(now: Date = new Date()): Promise<KanbanCard[]> {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const lastActivity = db
    .select({
      leadId: leadActivities.leadId,
      lastAt: sql<Date>`max(${leadActivities.occurredAt})`.as("last_at"),
    })
    .from(leadActivities)
    .groupBy(leadActivities.leadId)
    .as("last_activity");

  const rows = await db
    .select({
      id: leads.id,
      leadCode: leads.leadCode,
      stage: leads.stage,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      serviceName: services.nameEn,
      conditionSummary: leads.conditionSummary,
      ownerName: staffAccounts.name,
      nextActionAt: leads.nextActionAt,
      createdAt: leads.createdAt,
      lastActivityAt: sql<Date>`coalesce(${lastActivity.lastAt}, ${leads.createdAt})`,
      // Open leads sharing this phone, this one included: >1 means a repeat caller.
      sharedPhoneCount: sql<number>`count(*) over (
        partition by ${leads.contactPhone}
      )`,
    })
    .from(leads)
    .innerJoin(services, eq(services.id, leads.serviceId))
    .leftJoin(staffAccounts, eq(staffAccounts.id, leads.ownerId))
    .leftJoin(lastActivity, eq(lastActivity.leadId, leads.id))
    .where(sql`${leads.stage} NOT IN ('won', 'lost')`)
    .orderBy(desc(leads.createdAt));

  return sortForKanban(
    rows.map((r) => ({
      ...r,
      lastActivityAt: new Date(r.lastActivityAt),
      possibleDuplicate: Number(r.sharedPhoneCount) > 1,
    })),
    now,
  );
}

export interface LeadDetail extends KanbanCard {
  activities: { id: number; type: string; summary: string; occurredAt: Date; actorName: string }[];
}

/** One lead with its full activity trail — the record of every contact. */
export async function getLead(leadId: number): Promise<LeadDetail | null> {
  if (!isDbConfigured()) return null;
  const db = getDb();

  const [lead] = await db
    .select({
      id: leads.id,
      leadCode: leads.leadCode,
      stage: leads.stage,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      serviceName: services.nameEn,
      conditionSummary: leads.conditionSummary,
      ownerName: staffAccounts.name,
      nextActionAt: leads.nextActionAt,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(services, eq(services.id, leads.serviceId))
    .leftJoin(staffAccounts, eq(staffAccounts.id, leads.ownerId))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) return null;

  const activities = await db
    .select({
      id: leadActivities.id,
      type: leadActivities.type,
      summary: leadActivities.summary,
      occurredAt: leadActivities.occurredAt,
      actorName: staffAccounts.name,
    })
    .from(leadActivities)
    .innerJoin(staffAccounts, eq(staffAccounts.id, leadActivities.actorId))
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.occurredAt));

  return {
    ...lead,
    lastActivityAt: activities[0]?.occurredAt ?? lead.createdAt,
    possibleDuplicate: false,
    activities,
  };
}

/** The `lead`-archetype services an enquiry form may target (§11). */
export async function listLeadServices() {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ id: services.id, slug: services.slug, nameEn: services.nameEn, nameBn: services.nameBn })
    .from(services)
    .where(eq(services.archetype, "lead"));
}

/** One `lead` service by slug — null for a non-lead or unknown slug. */
export async function getLeadServiceBySlug(slug: string) {
  if (!isDbConfigured()) return null;
  const [service] = await getDb()
    .select({
      id: services.id,
      slug: services.slug,
      nameEn: services.nameEn,
      nameBn: services.nameBn,
      archetype: services.archetype,
      isActive: services.isActive,
    })
    .from(services)
    .where(eq(services.slug, slug))
    .limit(1);

  return service && service.archetype === "lead" ? service : null;
}
