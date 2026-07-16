"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetStaffPasswordAction } from "@/app/(office)/actions";

/**
 * Reset a colleague's forgotten password (§10.1). Admin-only — the page hides
 * it from `ops`, and the action refuses regardless. A UI hide is a courtesy on
 * top of a gate, never the gate.
 *
 * The temp password is shown once and is `must_change`, so the admin's
 * knowledge of it expires at their colleague's next sign-in.
 */
export function StaffPasswordReset({
  staffId,
  name,
  isSelf,
}: {
  staffId: number;
  name: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    // Self-reset is refused server-side; say why rather than showing a button
    // that will fail.
    return <span className="text-xs text-text-muted">Use Change password</span>;
  }

  if (password) {
    return (
      <div role="status" className="rounded-md border border-navy bg-navy-50 p-3">
        <p className="text-xs text-navy">Read this to {name} now — it is shown once:</p>
        <p className="my-1 font-mono text-base font-bold tracking-wider text-navy">{password}</p>
        <p className="text-xs text-text-muted">
          They must change it at their next sign-in. It is not stored anywhere readable.
        </p>
      </div>
    );
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await resetStaffPasswordAction(staffId);
      if (res.ok) {
        setPassword(res.data.password);
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

  return (
    <>
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className="min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy disabled:opacity-50"
      >
        {busy ? "Resetting…" : "Reset password"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}
