import type { Metadata } from "next";

export const metadata: Metadata = { title: "Complaints" };

// Complaint inbox (PRD §5). The auto-create rule (1–2★) and serious-tag suspend
// (with token revocation) are implemented in lib/server/office; this inbox view
// with SLA timers is fleshed out alongside the customer rating flow (module 05).
export default function ComplaintsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Complaints</h1>
      <p className="mt-1 mb-5 text-text-muted">
        1–2★ ratings auto-create a complaint; a serious tag suspends the caregiver
        and revokes their tokens immediately.
      </p>
      <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
        No open complaints.
      </p>
    </div>
  );
}
