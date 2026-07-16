import "server-only";

import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import { slots } from "../db/schema";

/**
 * Open slots for a zone + service (PRD §9, §11, AC 1.1). Full slots are
 * excluded HERE, server-side (`booked_count < capacity`), so the client can
 * never render a full slot — not even disabled. No-DB-safe.
 */
export interface OpenSlot {
  id: number;
  windowStart: Date;
  windowEnd: Date;
  capacity: number;
  bookedCount: number;
}

export async function listOpenSlots(
  zoneId: number,
  serviceId: number,
  fromDate?: string,
): Promise<OpenSlot[]> {
  if (!isDbConfigured()) return [];
  const from = fromDate ? new Date(fromDate) : new Date();

  return getDb()
    .select({
      id: slots.id,
      windowStart: slots.windowStart,
      windowEnd: slots.windowEnd,
      capacity: slots.capacity,
      bookedCount: slots.bookedCount,
    })
    .from(slots)
    .where(
      and(
        eq(slots.zoneId, zoneId),
        eq(slots.serviceId, serviceId),
        gte(slots.windowStart, from),
        sql`${slots.bookedCount} < ${slots.capacity}`,
      ),
    )
    .orderBy(asc(slots.windowStart))
    .limit(100);
}
