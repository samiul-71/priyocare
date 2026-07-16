"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issuePinAction, resetPinAction, verifyStepAction } from "@/app/(office)/actions";

/**
 * The verification checklist and the two gated actions (§12.2, AC 2.1/2.2).
 *
 * Nothing here decides anything. Ticking a step POSTs it and the SERVER
 * re-evaluates activation; the buttons below are enabled by what the server
 * last told us, and the server refuses regardless if we get it wrong. A UI hide
 * is not a gate (AC 2.2) — it is a courtesy on top of one.
 */
const STEP_LABEL: Record<string, string> = {
  nid: "NID verified",
  photo: "Photo on file",
  police_clearance: "Police clearance",
  skill_cert: "Skill certificate",
  interview: "Interview completed",
  references: "Two employer references called",
  safeguarding: "Child-safeguarding training + signed code of conduct",
};

const MISSING_LABEL: Record<string, string> = {
  bkash_payout_number: "bKash payout number",
  bnmc_reg_no: "BNMC registration number",
  activation: "Not activated yet",
};

export function VerificationChecklist({
  caregiverId,
  requiredSteps,
  completedSteps,
  canActivate,
  verificationStatus,
  hasPin,
  missing,
}: {
  caregiverId: number;
  requiredSteps: string[];
  completedSteps: string[];
  canActivate: boolean;
  verificationStatus: string;
  hasPin: boolean;
  missing: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);

  const done = new Set(completedSteps);

  async function tickStep(step: string) {
    setBusy(step);
    setError(null);
    try {
      const res = await verifyStepAction(caregiverId, { step });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh(); // the server re-evaluated activation; re-read it
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(null);
    }
  }

  async function issuePin() {
    setBusy("pin");
    setError(null);
    try {
      const res = await issuePinAction(caregiverId);
      if (res.ok) {
        setPin(res.data.pin); // shown once — never fetchable again
        router.refresh();
        return;
      }
      setError(res.error);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(null);
    }
  }

  async function resetPin() {
    setBusy("reset");
    setError(null);
    try {
      const res = await resetPinAction(caregiverId);
      if (res.ok) {
        setPin(res.data.pin);
        router.refresh();
        return;
      }
      setError(res.error);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(null);
    }
  }

  if (pin) {
    return (
      <div role="status" className="rounded-lg border border-navy bg-navy-50 p-5">
        <h2 className="font-display text-lg font-bold text-navy">PIN issued — read it out now</h2>
        <p className="my-3 font-mono text-3xl font-bold tracking-widest text-navy">{pin}</p>
        <p className="text-sm text-text-muted">
          This is shown once and is not stored anywhere we can read it back. If it is lost, reset it
          — there is no lookup. Ask her to memorise it, not photograph it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className="max-w-xl">
        {requiredSteps.map((step) => {
          const isDone = done.has(step);
          return (
            <li key={step} className="flex items-center justify-between border-b border-border py-3">
              <span className="flex items-center gap-2 text-sm">
                {/* Icon + text, not colour alone (design.md §5.1). */}
                <span aria-hidden="true" className={isDone ? "text-teal-900" : "text-text-muted"}>
                  {isDone ? "✓" : "○"}
                </span>
                <span className={isDone ? "text-teal-900" : "text-navy"}>
                  {STEP_LABEL[step] ?? step}
                </span>
              </span>
              {!isDone && (
                <button
                  type="button"
                  onClick={() => tickStep(step)}
                  disabled={busy !== null}
                  className="min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy disabled:opacity-50"
                >
                  {busy === step ? "Saving…" : "Mark done"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 max-w-xl rounded-lg border border-border bg-surface-alt p-4">
        {missing.length > 0 ? (
          <>
            <p className="text-sm font-medium text-navy">
              <span aria-hidden="true">○ </span>
              Not activatable yet — {missing.length} outstanding
            </p>
            {/* Say exactly what is blocking, so Ops never has to guess (AC 2.1). */}
            <ul className="mt-2 list-inside list-disc text-sm text-text-muted">
              {missing.map((m) => (
                <li key={m}>{MISSING_LABEL[m] ?? STEP_LABEL[m] ?? m}</li>
              ))}
            </ul>
          </>
        ) : verificationStatus !== "approved" ? (
          <>
            <p className="text-sm font-medium text-teal-900">
              <span aria-hidden="true">✓ </span>
              Checklist complete — ready to activate
            </p>
            <ActivateButton caregiverId={caregiverId} busy={busy} setBusy={setBusy} setError={setError} />
          </>
        ) : hasPin ? (
          <>
            <p className="text-sm text-teal-900">
              <span aria-hidden="true">● </span>
              Active with a login.
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Forgotten her PIN? Reset it — nobody can look the old one up. Check who you are
              speaking to first: this hands out a working credential.
            </p>
            <button
              type="button"
              onClick={resetPin}
              disabled={busy !== null}
              className="mt-3 min-h-9 rounded-md border border-border px-4 text-sm font-medium text-navy disabled:opacity-50"
            >
              {busy === "reset" ? "Resetting…" : "Reset PIN"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-teal-900">
              <span aria-hidden="true">◑ </span>
              Approved. Issue her login PIN to finish.
            </p>
            <button
              type="button"
              onClick={issuePin}
              disabled={busy !== null || !canActivate}
              className="mt-3 min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "pin" ? "Issuing…" : "Issue login PIN"}
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            <span aria-hidden="true">! </span>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Activation is its own call: the server re-checks the whole gate (AC 2.2). */
function ActivateButton({
  caregiverId,
  busy,
  setBusy,
  setError,
}: {
  caregiverId: number;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
}) {
  const router = useRouter();

  async function activate() {
    setBusy("activate");
    setError(null);
    try {
      // The action re-evaluates the gate and flips the status when the
      // checklist passes; re-posting a completed step is idempotent.
      const res = await verifyStepAction(caregiverId, { step: "interview" });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <button
      type="button"
      onClick={activate}
      disabled={busy !== null}
      className="mt-3 min-h-9 rounded-md bg-teal-800 px-4 text-sm font-medium text-white disabled:opacity-50"
    >
      {busy === "activate" ? "Activating…" : "Activate caregiver"}
    </button>
  );
}
