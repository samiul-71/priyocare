/**
 * The offline event model (PRD §9, §6 Flow B, module 07).
 *
 * The composition that must hold: **every caregiver write becomes one of these
 * events, captured on the device, before any network call.** GPS and timestamp
 * are read locally; the event is queued in IndexedDB regardless of auth state
 * or signal; sync replays it later with the ORIGINAL `occurredAt`. That is why
 * `occurredAt` is part of the event rather than something the server stamps —
 * a shift worked at 09:00 and synced at 18:00 happened at 09:00, and the record
 * has to say so (§7: device time is authoritative).
 *
 * `eventUuid` is minted on the device and is the idempotency key: the same
 * batch delivered twice must produce one row (AC-2.2, S-3). Two devices, a
 * retried fetch, a double-tap — all collapse to one event.
 */

export const CAREGIVER_EVENT_TYPES = [
  "check_in",
  "check_out",
  "task_tick",
  "care_log",
  "sample_scan",
] as const;

export type CaregiverEventType = (typeof CAREGIVER_EVENT_TYPES)[number];

export interface CaregiverEvent {
  /** Device-minted idempotency key (AC-2.2). */
  eventUuid: string;
  type: CaregiverEventType;
  bookingId: number;
  /** Device clock at the moment of the action — never the server's (§7). */
  occurredAt: string; // ISO-8601
  payload: Record<string, unknown>;
}

/**
 * Mint an event id. `crypto.randomUUID` is available in every browser that can
 * run a service worker and in Node ≥19, so there is no fallback to a weaker
 * source: a colliding id would merge two real events, which is worse than
 * failing loudly here.
 */
export function newEventUuid(): string {
  return globalThis.crypto.randomUUID();
}

export function makeEvent(
  type: CaregiverEventType,
  bookingId: number,
  payload: Record<string, unknown> = {},
  occurredAt: Date = new Date(),
): CaregiverEvent {
  return {
    eventUuid: newEventUuid(),
    type,
    bookingId,
    occurredAt: occurredAt.toISOString(),
    payload,
  };
}

/**
 * Collapse a batch to one event per uuid, keeping the FIRST occurrence.
 *
 * The device can legitimately hold the same event twice (a queue flush that
 * failed after the POST but before the local delete, then re-queued). Keeping
 * the first preserves the original capture; the server dedupes again by unique
 * constraint regardless — this just avoids shipping obvious garbage.
 */
export function dedupeEvents(events: CaregiverEvent[]): CaregiverEvent[] {
  const seen = new Map<string, CaregiverEvent>();
  for (const event of events) {
    if (!seen.has(event.eventUuid)) seen.set(event.eventUuid, event);
  }
  return [...seen.values()];
}

/**
 * Replay order: oldest first, by DEVICE time.
 *
 * A check-out must never be applied before its check-in, and after a day
 * offline the queue is the only thing that knows the real order — the server's
 * receive order is just "whatever the radio managed first".
 */
export function orderForReplay(events: CaregiverEvent[]): CaregiverEvent[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    // Same millisecond (a fast tick-tick): fall back to a stable key so replay
    // order is deterministic rather than dependent on array order.
    return diff !== 0 ? diff : a.eventUuid.localeCompare(b.eventUuid);
  });
}

/** The booking status each event drives (§7). Sync applies these in order. */
export const EVENT_BOOKING_STATUS: Partial<Record<CaregiverEventType, string>> = {
  check_in: "in_progress",
  check_out: "completed",
};
