"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffActiveAction } from "@/app/(office)/actions";

/**
 * Deactivate / reactivate an office account (§10.4). Admin-only — the page hides
 * it from `ops` and never renders it for the signed-in admin's own row; the
 * action refuses both cases regardless. A UI hide is a courtesy on a gate.
 *
 * Deactivation asks for confirmation because it ends someone's access on their
 * next request (and revokes their tokens now); reactivation is low-stakes and
 * goes straight through.
 */
export function StaffActiveToggle({
  staffId,
  name,
  isActive,
}: {
  staffId: number;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (isActive && !confirm(`Deactivate ${name}? They lose access immediately and cannot sign in.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await setStaffActiveAction(staffId, !isActive);
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

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="mt-1 block min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy disabled:opacity-50"
      >
        {busy ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}
