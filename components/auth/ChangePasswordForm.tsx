"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordSchema } from "@/lib/shared/auth-schemas";
import { changeStaffPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";

/**
 * Staff password change (§10.1). Validates against the same shared schema the
 * action enforces (§10.3).
 *
 * The action revokes every session opened with the old password and re-issues
 * her cookie, so she stays signed in on this device and nowhere else.
 */
export function ChangePasswordForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Masked by default, but revealable. The one error people cannot get past on
  // this screen is "same as the current one", and it is invisible while both
  // boxes show dots: a password manager that fills BOTH fields with the saved
  // sign-in credential, or a typo'd repeat, looks identical to a correct entry.
  // Showing the characters is what lets them see the two are the same and fix it.
  const [reveal, setReveal] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = changePasswordSchema.safeParse(raw);
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
      const res = await changeStaffPasswordAction(parsed.data);
      if (res.ok) {
        router.push(returnTo);
        router.refresh();
        return;
      }
      setMessage(res.error);
    } catch {
      setMessage("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-xs text-danger">
        {errors[name].join(" ")}
      </p>
    ) : null;

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  const inputType = reveal ? "text" : "password";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex items-baseline justify-between">
        <label className="block text-sm font-medium" htmlFor="currentPassword">
          Current password
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
        id="currentPassword"
        name="currentPassword"
        type={inputType}
        autoComplete="current-password"
        autoFocus
        className={fieldClass}
        aria-describedby="currentPassword-error"
      />
      {err("currentPassword")}

      <label className="mt-4 block text-sm font-medium" htmlFor="newPassword">
        New password
      </label>
      <input
        id="newPassword"
        name="newPassword"
        type={inputType}
        autoComplete="new-password"
        className={fieldClass}
        aria-describedby="newPassword-error newPassword-help"
      />
      <p id="newPassword-help" className="mt-1 text-xs text-text-muted">
        At least 12 characters, and different from the one you just signed in with. Length is what
        matters — a passphrase of a few ordinary words beats a short one with symbols in it.
      </p>
      {err("newPassword")}

      <Button type="submit" size="office" disabled={busy} className="mt-5 min-h-10 w-full">
        {busy ? "Saving…" : "Save password"}
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
