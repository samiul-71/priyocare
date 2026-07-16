"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCaregiverSchema } from "@/lib/shared/office-schemas";
import { updateCaregiverAction } from "@/app/(office)/actions";

/**
 * Set the bKash payout number — an activation requirement, not admin trivia
 * (§12.2). Missing it is one of the things `evaluateActivation` reports as
 * blocking, so this sits next to the checklist rather than buried in a settings
 * screen.
 */
export function PayoutNumberForm({
  caregiverId,
  current,
}: {
  caregiverId: number;
  current: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const parsed = updateCaregiverSchema.safeParse({ bkashPayoutNumber: value });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Enter a valid bKash number.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateCaregiverAction(caregiverId, parsed.data);
      if (res.ok) {
        setMessage("Saved.");
        router.refresh(); // activation may have just become possible
        return;
      }
      setMessage(res.error);
    } catch {
      setMessage("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-start gap-2">
      <label className="sr-only" htmlFor="bkashPayoutNumber">
        bKash payout number
      </label>
      <input
        id="bkashPayoutNumber"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="tel"
        placeholder="01XXXXXXXXX"
        className="min-h-9 flex-1 rounded-md border border-border px-3 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="min-h-9 rounded-md border border-border px-3 text-sm font-medium text-navy disabled:opacity-50"
      >
        {busy ? "Saving…" : current ? "Update" : "Save"}
      </button>
      {message && (
        <p role="status" className="w-full text-xs text-text-muted">
          {message}
        </p>
      )}
    </form>
  );
}
