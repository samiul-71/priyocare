/**
 * Booking / lead codes — the human-facing reference the call centre reads over
 * the phone (PRD §7.2). Format: `PC-YYMMDD-NNNN` (e.g. PC-260715-0042). The
 * daily sequence number is allocated by the DB; this is the pure formatter.
 */
export function formatBookingCode(seq: number, date: Date = new Date()): string {
  return `PC-${datePart(date)}-${pad(seq, 4)}`;
}

export function formatLeadCode(seq: number, date: Date = new Date()): string {
  return `LD-${datePart(date)}-${pad(seq, 4)}`;
}

function datePart(date: Date): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);
  return `${yy}${mm}${dd}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
