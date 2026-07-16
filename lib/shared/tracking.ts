/**
 * Tracking + report status steppers (PRD §5, §11). The status timeline is the
 * trust product, so every step is conveyed by an ICON + TEXT LABEL — never
 * colour alone — and reads correctly in greyscale (AC 7.3 / design.md §5.2).
 *
 * The customer never sees internal ops signals (a geofence mismatch is not a
 * step here — PRD §9, AC 4.2), and a delayed feed shows an honest "delayed"
 * state, never a fabricated status (AC 3.1 of module 05).
 */

export interface Step {
  key: string;
  label: string;
  glyph: string;
}

/** The customer-facing visit journey (a subset of booking_status). */
export const BOOKING_STEPS: Step[] = [
  { key: "confirmed", label: "Confirmed", glyph: "✓" },
  { key: "en_route", label: "On the way", glyph: "→" },
  { key: "arrived", label: "Arrived", glyph: "⌖" },
  { key: "in_progress", label: "In progress", glyph: "●" },
  { key: "completed", label: "Completed", glyph: "✓✓" },
];

// Maps a raw booking_status to its index on the customer stepper. Statuses that
// aren't customer-facing journey steps map onto the nearest one; 'pending' and
// 'cancelled'/'no_show' return -1 (no active step).
const BOOKING_STATUS_TO_STEP: Record<string, number> = {
  pending: -1,
  confirmed: 0,
  dispatched: 1,
  en_route: 1,
  arrived: 2,
  in_progress: 3,
  completed: 4,
  cancelled: -1,
  no_show: -1,
};

export function bookingStepIndex(status: string): number {
  return BOOKING_STATUS_TO_STEP[status] ?? -1;
}

export function isTerminalCancelled(status: string): boolean {
  return status === "cancelled" || status === "no_show";
}

/** The sample → report chain-of-custody the customer can watch. */
export const SAMPLE_STEPS: Step[] = [
  { key: "collected", label: "Collected", glyph: "✓" },
  { key: "in_transit", label: "In transit", glyph: "→" },
  { key: "received_by_lab", label: "At lab", glyph: "⌂" },
  { key: "processing", label: "Processing", glyph: "●" },
  { key: "report_ready", label: "Report ready", glyph: "✓✓" },
];

const SAMPLE_STATUS_TO_STEP: Record<string, number> = {
  collected: 0,
  in_transit: 1,
  received_by_lab: 2,
  processing: 3,
  report_ready: 4,
  rejected: -1, // re-collection path (free) — handled by Ops, shown honestly
};

export function sampleStepIndex(status: string): number {
  return SAMPLE_STATUS_TO_STEP[status] ?? -1;
}

export function isReportReady(status: string): boolean {
  return status === "report_ready";
}

export function isSampleRejected(status: string): boolean {
  return status === "rejected";
}
