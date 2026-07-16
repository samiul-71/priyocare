"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STAGES, STAGE_LABEL, isClosed, validateStageChange } from "@/lib/shared/leads";
import type { LeadStage } from "@/lib/shared/leads";
import { staffAuthHeader } from "@/lib/shared/client-tokens";

/**
 * Advance a lead from its card (AC-3.1). A <select> + button, not drag-and-drop:
 * dragging is the part of a Kanban that fails keyboard and screen-reader users,
 * and the board's job is making the next action obvious, not being pretty.
 *
 * The same `validateStageChange` the server enforces runs here first, so a bad
 * move is refused before the round-trip — and the server refuses it again
 * regardless (§10.3, one rule, both sides).
 */
export function LeadStageControls({
  leadId,
  stage,
  contactName,
}: {
  leadId: number;
  stage: LeadStage;
  contactName: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<LeadStage | "">("");
  const [lostReason, setLostReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsReason = target === "lost";

  async function advance() {
    if (!target) return;
    setError(null);

    const check = validateStageChange({ from: stage, to: target, lostReason });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/v1/office/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...staffAuthHeader() },
        body: JSON.stringify({
          stage: target,
          ...(needsReason ? { lostReason } : {}),
        }),
      });
      if (res.ok) {
        setTarget("");
        setLostReason("");
        router.refresh(); // re-render the board from the server
        return;
      }
      if (res.status === 401) {
        setError("Session expired — sign in again.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.message ?? "Could not update the lead.");
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  const selectId = `stage-${leadId}`;
  const reasonId = `lost-reason-${leadId}`;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <label className="sr-only" htmlFor={selectId}>
        Move {contactName} to stage
      </label>
      <select
        id={selectId}
        value={target}
        onChange={(e) => setTarget(e.target.value as LeadStage)}
        className="w-full rounded-md border border-border px-2 py-1 text-xs"
      >
        <option value="">Move to…</option>
        {LEAD_STAGES.filter((s) => s !== stage && s !== "dormant").map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>

      {needsReason && (
        <>
          <label className="sr-only" htmlFor={reasonId}>
            Why was this lead lost?
          </label>
          <input
            id={reasonId}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Reason (required)"
            className="mt-2 w-full rounded-md border border-border px-2 py-1 text-xs"
          />
        </>
      )}

      {target && (
        <button
          type="button"
          onClick={advance}
          disabled={busy || isClosed(stage)}
          className="mt-2 w-full rounded-md bg-navy px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : `Move to ${STAGE_LABEL[target]}`}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
    </div>
  );
}
