"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rejectCaregiverAction, reopenCaregiverAction } from "@/app/(office)/actions";

/**
 * Reject an application, or reopen a rejected one (§12.2).
 *
 * The reason is required and shown back afterwards, because this ends a real
 * person's chance of work here — "why?" must have an answer six months later,
 * when she asks or when Ops is asked to justify a pattern. Until now the
 * `rejected` status existed and nothing set it, so a failed police check simply
 * left the application at `pending` forever.
 *
 * Reopen exists because `caregivers.phone` is unique: without it a rejection is
 * permanent, even a mistaken one — she could never re-apply on her own number.
 */
export function RejectCaregiver({
  caregiverId,
  status,
  statusReason,
}: {
  caregiverId: number;
  status: string;
  statusReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reject() {
    setError(null);
    if (reason.trim() === "") {
      setError("A reason is required to reject an application.");
      return;
    }
    setBusy(true);
    try {
      const res = await rejectCaregiverAction(caregiverId, { reason });
      if (res.ok) {
        setOpen(false);
        setReason("");
        router.refresh();
        return;
      }
      setError(res.error);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError(null);
    try {
      const res = await reopenCaregiverAction(caregiverId);
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(res.error);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "rejected") {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface-alt p-4">
        <p className="text-sm font-medium text-danger">
          <span aria-hidden="true">✕ </span>
          Application rejected
        </p>
        {statusReason && (
          <p className="mt-1 text-sm text-text-muted">
            Reason: <span className="text-navy">{statusReason}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-text-muted">
          She cannot re-apply on this number while it is rejected. Reopen if she has come back with
          what was missing, or if this was a mistake — the reason above is kept either way.
        </p>
        <button
          type="button"
          onClick={reopen}
          disabled={busy}
          className="mt-3 min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy disabled:opacity-50"
        >
          {busy ? "Reopening…" : "Reopen application"}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Nothing to reject: she is working (that would be a suspension) or already gone.
  if (status === "approved" || status === "suspended") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted underline"
      >
        Reject this application
      </button>
    );
  }

  return (
    <div className="max-w-xl rounded-lg border border-border p-4">
      <label className="block text-sm font-medium text-navy" htmlFor="rejectReason">
        Why is this application rejected?
      </label>
      <p className="mb-1 text-xs text-text-muted">
        Recorded against her file. She may ask, and Ops may be asked.
      </p>
      <input
        id="rejectReason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. police clearance could not be verified"
        className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        aria-describedby="rejectReason-error"
      />
      {error && (
        <p id="rejectReason-error" role="alert" className="mt-1 text-xs text-danger">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={reject}
          disabled={busy}
          className="min-h-8 rounded-md bg-danger px-3 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Rejecting…" : "Reject application"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="min-h-8 rounded-md border border-border px-3 text-xs text-navy"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
