"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { caregiverLoginSchema } from "@/lib/shared/auth-schemas";
import { Button } from "@/components/ui/Button";

/**
 * Caregiver login form — phone + PIN (§10.1), validated against the shared Zod
 * schema the handler uses.
 *
 * Caregiver sizing (design.md §5): 56px targets, 18px base, numeric keypad for
 * both fields — this is used one-handed, outdoors, in sunlight.
 *
 * No token is stashed in localStorage here (unlike the office forms): caregiver
 * writes go to IndexedDB and sync in module 07, which owns the access token and
 * its silent refresh. All this screen needs to establish is the page session.
 */
type FieldErrors = Record<string, string[]>;

export function CaregiverLoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = caregiverLoginSchema.safeParse(raw);
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
      const res = await fetch("/api/v1/auth/caregiver/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      // The token pair in the body is not read here — module 07's sync layer
      // owns it. This screen only needs the cookie the response just set.
      if (res.ok) {
        router.push(returnTo);
        router.refresh();
        return;
      }
      if (res.status === 429) {
        setMessage("অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
      } else {
        // Also the answer for a not-yet-approved or suspended caregiver — the
        // handler never distinguishes those from a wrong PIN (§7.4, §12.2).
        setMessage("ফোন নম্বর বা পিন ভুল।");
      }
    } catch {
      setMessage("নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
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
      <label className="block text-base font-medium" htmlFor="phone">
        মোবাইল নম্বর
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        placeholder="01XXXXXXXXX"
        autoFocus
        className={fieldClass}
        aria-describedby="phone-error"
      />
      {err("phone")}

      <label className="mt-4 block text-base font-medium" htmlFor="pin">
        পিন
      </label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        className={fieldClass}
        aria-describedby="pin-error"
      />
      {err("pin")}

      <Button
        type="submit"
        variant="secondary"
        size="caregiver"
        disabled={submitting}
        className="mt-6 w-full"
      >
        {submitting ? "অপেক্ষা করুন…" : "সাইন ইন"}
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
