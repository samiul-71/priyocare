"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { staffLoginSchema } from "@/lib/shared/auth-schemas";
import { signInStaffAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";

/**
 * Staff login form. Validates against the SAME shared Zod schema the action
 * uses (§10.3, no drift), then calls a Server Action.
 *
 * The action issues the httpOnly cookie and NOTHING else (module 09). This form
 * used to POST the API login and stash the returned Bearer pair in
 * localStorage, where any XSS on the origin could read it. Now no API
 * credential ever reaches the browser: the cookie is invisible to this
 * component, which can neither read nor forge it.
 */
type FieldErrors = Record<string, string[]>;

export function StaffLoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = staffLoginSchema.safeParse(raw);
    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        (fe[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const result = await signInStaffAction(parsed.data);
      if (result.ok) {
        router.push(returnTo);
        // The cookie was set by the action; refresh so the destination
        // re-renders on the server as a signed-in staff member.
        router.refresh();
        return;
      }
      // Deliberately vague — never reveal whether the email exists.
      setMessage(result.error);
    } catch {
      setMessage("Network error — please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-xs text-danger">
        {errors[name].join(" ")}
      </p>
    ) : null;

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  return (
    <form onSubmit={onSubmit} noValidate>
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        autoFocus
        className={fieldClass}
        aria-describedby="email-error"
      />
      {err("email")}

      <label className="mt-3 block text-sm font-medium" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className={fieldClass}
        aria-describedby="password-error"
      />
      {err("password")}

      <Button
        type="submit"
        size="office"
        disabled={submitting}
        className="mt-5 w-full min-h-10"
      >
        {submitting ? "Signing in…" : "Sign in"}
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
