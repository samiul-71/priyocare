"use client";

import { useState } from "react";
import { forgotPasswordSchema } from "@/lib/shared/auth-schemas";
import { requestStaffPasswordResetAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";

/**
 * Request a password-reset email (§10.1).
 *
 * The confirmation is deliberately the SAME whether or not the address is
 * registered — the action answers identically, and the UI must not undo that by
 * behaving differently. Anyone could otherwise use this form to learn who has an
 * office account, and those accounts can read every patient's address.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestStaffPasswordResetAction(parsed.data);
      setSent(true);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface-alt p-3 text-sm text-navy"
      >
        <span aria-hidden="true">✓ </span>
        If that address has an office account, we&rsquo;ve sent a reset link. It expires in 30
        minutes — check your inbox, and your spam folder.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label className="block text-sm font-medium" htmlFor="email">
        Office email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        aria-describedby="email-error"
      />
      {error && (
        <p id="email-error" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}

      <Button type="submit" size="office" disabled={busy} className="mt-5 min-h-10 w-full">
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
