import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/server/auth/dal";
import { listLeadsForKanban } from "@/lib/server/leads/queries";
import { LeadCard } from "@/components/office/LeadCard";
import { PIPELINE_STAGES, STAGE_LABEL, countOverdue } from "@/lib/shared/leads";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic"; // always show live pipeline data

/**
 * Lead Kanban (§5, §9, module 06).
 *
 * Not a booking queue: no slot, no dispatch, no caregiver, no SLA timer appears
 * anywhere on this board (§3.2, AC-2.1). Its one job is making the next action
 * obvious — which is why the overdue count leads, and overdue cards pin to the
 * top of every column (AC-1.1, ordering by `sortForKanban`).
 *
 * Empty-safe: with no database it renders the empty state rather than crashing.
 */
export default async function LeadsPage() {
  await requireStaffPage();

  const now = new Date();
  const leads = await listLeadsForKanban(now);
  const overdue = countOverdue(leads, now);
  const dormant = leads.filter((l) => l.stage === "dormant");

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold text-navy">Leads</h1>
        <p className="text-sm text-text-muted">
          {leads.length} open · Medical Tourism, Health Insurance
        </p>
      </div>

      {/* The number that matters first: a lead going silent is the one failure
          mode this module exists to prevent (§13 — target: zero). */}
      <p
        className={`mb-5 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
          overdue > 0
            ? "border-danger bg-surface-alt font-medium text-danger"
            : "border-border bg-surface-alt text-text-muted"
        }`}
        role="status"
      >
        <span aria-hidden="true">{overdue > 0 ? "⚠" : "✓"}</span>
        {overdue > 0
          ? `${overdue} follow-up${overdue === 1 ? "" : "s"} overdue — pinned to the top of each column`
          : "No overdue follow-ups"}
      </p>

      {leads.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No leads yet. Enquiries from{" "}
          <span className="font-medium text-navy">/enquiry/medical-tourism</span> and{" "}
          <span className="font-medium text-navy">/enquiry/health-insurance</span> land here, as do
          leads Ops takes over the hotline.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage) => {
            const column = leads.filter((l) => l.stage === stage);
            return (
              <section key={stage} className="w-64 shrink-0" aria-label={STAGE_LABEL[stage]}>
                <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-navy">
                  {STAGE_LABEL[stage]}
                  <span className="text-xs font-normal text-text-muted">{column.length}</span>
                </h2>
                {column.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-xs text-text-muted">
                    No leads in this stage
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {column.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} now={now} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {dormant.length > 0 && (
        // Surfaced, not hidden (§12.1): a dormant lead is re-touched weekly, so
        // it stays on the board below the live pipeline rather than vanishing.
        <section className="mt-8" aria-label="Dormant">
          <h2 className="mb-2 text-sm font-semibold text-navy">
            Dormant <span className="font-normal text-text-muted">({dormant.length})</span>
          </h2>
          <p className="mb-2 text-xs text-text-muted">
            Quiet for 30+ days. Re-touch weekly, or mark lost with a reason.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dormant.map((lead) => (
              <LeadCard key={lead.id} lead={lead} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
