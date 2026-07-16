import { isOverdue, daysSilent, STAGE_LABEL } from "@/lib/shared/leads";
import type { KanbanCard } from "@/lib/server/leads/queries";
import { LeadStageControls } from "./LeadStageControls";

/**
 * One lead on the board (§9, §11, AC-1.1).
 *
 * The overdue marker is text + icon, never colour alone (design.md §5.1) — an
 * Ops user with a colour vision deficiency must see the same "this is late"
 * the rest of the room sees.
 */
function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function LeadCard({ lead, now }: { lead: KanbanCard; now: Date }) {
  const overdue = isOverdue(lead, now);
  const quietDays = daysSilent(lead.lastActivityAt, now);

  return (
    <li
      className={`rounded-lg border bg-white p-3 ${
        overdue ? "border-danger border-l-4" : "border-border"
      }`}
    >
      {overdue && (
        <p className="mb-1 text-xs font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          Follow-up overdue
          {lead.nextActionAt ? ` — due ${formatDay(lead.nextActionAt)}` : ""}
        </p>
      )}

      <p className="font-medium text-navy">{lead.contactName}</p>
      <p className="text-xs text-text-muted">
        {lead.serviceName} · {lead.leadCode}
      </p>

      {lead.conditionSummary && (
        <p className="mt-2 line-clamp-2 text-xs text-text-muted">{lead.conditionSummary}</p>
      )}

      {lead.possibleDuplicate && (
        // Surfaced to the owner, never auto-merged (§11): two enquiries from one
        // number can be two real patients — a son enquiring for both parents.
        <p className="mt-2 text-xs text-navy">
          <span aria-hidden="true">⧉ </span>
          Another open lead shares this number — check before calling
        </p>
      )}

      <dl className="mt-2 flex flex-wrap gap-x-3 text-xs text-text-muted">
        <div className="flex gap-1">
          <dt>Owner:</dt>
          <dd className={lead.ownerName ? "" : "font-medium text-navy"}>
            {lead.ownerName ?? "Unassigned"}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Next:</dt>
          <dd>{lead.nextActionAt ? formatDay(lead.nextActionAt) : "not set"}</dd>
        </div>
        {quietDays > 0 && (
          <div className="flex gap-1">
            <dt>Quiet:</dt>
            <dd>{quietDays}d</dd>
          </div>
        )}
      </dl>

      <p className="sr-only">Stage: {STAGE_LABEL[lead.stage]}</p>
      <LeadStageControls leadId={lead.id} stage={lead.stage} contactName={lead.contactName} />
    </li>
  );
}
