"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPasswordSchema } from "@/lib/shared/auth-schemas";
import { resetStaffPasswordWithTokenAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";

/**
 * Set a new password from an emailed link (§10.1). The `token` is the authority;
 * this form only collects the new password (twice) and validates it against the
 * same shared schema the action enforces (§10.3).
 *
 * On success it does NOT sign the user in — every session the old password
 * opened was just revoked, so it sends them to sign in fresh with the new one.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reveal, setReveal] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (newPassword !== confirm) {
      setErrors({ confirm: ["The two passwords do not match."] });
      return;
    }

    const parsed = resetPasswordSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "newPassword" ? "newPassword" : "_";
        (fe[key] ??= []).push(issue.message);
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await resetStaffPasswordWithTokenAction(parsed.data);
      if (res.ok) {
        setDone(true);
        return;
      }
      setMessage(res.error);
    } catch {
      setMessage("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-md border border-border bg-surface-alt p-4">
        <p className="text-sm text-navy">
          <span aria-hidden="true">✓ </span>
          Your password is updated. Every other session was signed out.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/office/login" className="font-medium text-teal-900 underline">
            Sign in with your new password
          </Link>
        </p>
      </div>
    );
  }

  const inputType = reveal ? "text" : "password";
  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex items-baseline justify-between">
        <label className="block text-sm font-medium" htmlFor="newPassword">
          New password
        </label>
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-pressed={reveal}
          className="text-xs font-medium text-navy underline"
        >
          {reveal ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id="newPassword"
        name="newPassword"
        type={inputType}
        autoComplete="new-password"
        autoFocus
        className={fieldClass}
        aria-describedby="newPassword-error newPassword-help"
      />
      <p id="newPassword-help" className="mt-1 text-xs text-text-muted">
        At least 12 characters. Length is what matters — a passphrase of a few ordinary words beats
        a short one with symbols in it.
      </p>
      {errors.newPassword && (
        <p id="newPassword-error" className="mt-1 text-xs text-danger">
          {errors.newPassword.join(" ")}
        </p>
      )}

      <label className="mt-4 block text-sm font-medium" htmlFor="confirm">
        Confirm new password
      </label>
      <input
        id="confirm"
        name="confirm"
        type={inputType}
        autoComplete="new-password"
        className={fieldClass}
        aria-describedby="confirm-error"
      />
      {errors.confirm && (
        <p id="confirm-error" className="mt-1 text-xs text-danger">
          {errors.confirm.join(" ")}
        </p>
      )}

      <Button type="submit" size="office" disabled={busy} className="mt-5 min-h-10 w-full">
        {busy ? "Saving…" : "Set new password"}
      </Button>

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-border bg-surface-alt p-3 text-sm text-danger"
        >
          <span aria-hidden="true">! </span>
          {message}
        </p>
      )}
    </form>
  );
}
