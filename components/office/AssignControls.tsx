"use client";

import { useState } from "react";
import { dispatchAction } from "@/app/(office)/actions";

/**
 * Dispatch controls (PRD §9, AC 3.1). Ops picks from the ranked eligible list;
 * choosing anyone other than the top-ranked caregiver requires a reason, which
 * the server stores with the booking. Only eligible caregivers are shown — the
 * API re-checks eligibility regardless.
 */
export interface Candidate {
  id: number;
  fullName: string;
  ratingAvg: number;
}

export function AssignControls({
  bookingId,
  candidates,
}: {
  bookingId: number;
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState<number | null>(candidates[0]?.id ?? null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const topRankedId = candidates[0]?.id ?? null;
  const isOverride = selected !== null && selected !== topRankedId;

  async function assign() {
    if (selected === null) return;
    if (isOverride && reason.trim() === "") {
      setResult({ ok: false, message: "A reason is required to dispatch a non-top-ranked caregiver." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await dispatchAction(bookingId, {
        caregiverId: selected,
        ...(isOverride ? { reason } : {}),
      });
      setResult(
        res.ok
          ? { ok: true, message: "Caregiver dispatched." }
          : { ok: false, message: res.error },
      );
    } catch {
      setResult({ ok: false, message: "Network error — please retry." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <ul className="max-w-lg">
        {candidates.map((c, i) => (
          <li key={c.id} className="border-b border-border py-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="caregiver"
                value={c.id}
                checked={selected === c.id}
                onChange={() => setSelected(c.id)}
              />
              <span className="font-medium text-navy">{c.fullName}</span>
              <span className="tabular text-sm text-text-muted">★ {c.ratingAvg.toFixed(2)}</span>
              {i === 0 && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-900">
                  Top ranked
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {isOverride && (
        <div className="mt-3 max-w-lg">
          <label htmlFor="reason" className="block text-sm text-danger">
            Override reason (required)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      )}

      <button
        type="button"
        onClick={assign}
        disabled={submitting || selected === null}
        className="mt-3 inline-flex min-h-9 items-center rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Dispatching…" : "Dispatch"}
      </button>

      {result && (
        <p
          role="status"
          className={`mt-3 max-w-lg rounded-md border border-border p-3 text-sm ${
            result.ok ? "bg-teal-50 text-teal-900" : "bg-surface-alt text-danger"
          }`}
        >
          <span aria-hidden="true">{result.ok ? "✓ " : "! "}</span>
          {result.message}
        </p>
      )}
    </div>
  );
}
