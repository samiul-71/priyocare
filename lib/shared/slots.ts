/**
 * Slot capacity (PRD §9, §11, AC 1.1). A full slot is never selectable — not
 * even disabled. The server excludes full slots from the query; this shared
 * predicate is the single definition of "open", reused by the UI so a full slot
 * can never render.
 */
export interface SlotCapacity {
  capacity: number;
  bookedCount: number;
}

export function isSlotOpen(slot: SlotCapacity): boolean {
  return slot.bookedCount < slot.capacity;
}

export function remainingCapacity(slot: SlotCapacity): number {
  return Math.max(0, slot.capacity - slot.bookedCount);
}
