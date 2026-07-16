"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePinSchema } from "@/lib/shared/auth-schemas";
import { storeCaregiverTokens } from "@/lib/shared/client-tokens";
import { changeCaregiverPinAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";

/**
 * First-login PIN change (§12.2). Caregiver sizing: 56px targets, 18px base,
 * numeric keypads — this happens on a cheap phone, probably at the office desk
 * where Ops just read the initial PIN out.
 *
 * Validates against the same shared schema the action enforces (§10.3). The
 * action revokes every session opened with the old PIN and issues her a fresh
 * pair, which is stored here so the sync layer keeps working without a re-login.
 */
export function ChangePinForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = changePinSchema.safeParse(raw);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (fe[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    setBusy(true);

    try {
      const res = await changeCaregiverPinAction(parsed.data);
      if (res.ok) {
        // Her old tokens were just revoked with everyone else's; these are the
        // replacements, so sync keeps working without another sign-in.
        storeCaregiverTokens(res.tokens);
        router.push("/caregiver/today");
        router.refresh();
        return;
      }
      setMessage(res.error);
    } catch {
      setMessage("নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-sm text-danger">
        {errors[name].join(" ")}
      </p>
    ) : null;

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-3 text-lg";

  return (
    <form onSubmit={onSubmit} noValidate>
      <label className="block text-base font-medium" htmlFor="currentPin">
        এখনকার পিন
      </label>
      <input
        id="currentPin"
        name="currentPin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        autoFocus
        className={fieldClass}
        aria-describedby="currentPin-error"
      />
      {err("currentPin")}

      <label className="mt-4 block text-base font-medium" htmlFor="newPin">
        নতুন পিন
      </label>
      <input
        id="newPin"
        name="newPin"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        className={fieldClass}
        aria-describedby="newPin-error newPin-help"
      />
      <p id="newPin-help" className="mt-1 text-sm text-text-muted">
        ৪–৬ সংখ্যা। ১২৩৪ বা ০০০০ চলবে না।
      </p>
      {err("newPin")}

      <Button
        type="submit"
        variant="secondary"
        size="caregiver"
        disabled={busy}
        className="mt-6 w-full"
      >
        {busy ? "অপেক্ষা করুন…" : "পিন সেভ করুন"}
      </Button>

      {message && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-border bg-surface-alt p-3 text-base text-danger"
        >
          <span aria-hidden="true">! </span>
          {message}
        </p>
      )}
    </form>
  );
}
