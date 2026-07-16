"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bdPhone, resetPinWithOtpSchema } from "@/lib/shared/auth-schemas";
import { storeCaregiverTokens } from "@/lib/shared/client-tokens";
import { Button } from "@/components/ui/Button";

/**
 * Self-service PIN reset (§10.1's OTP fallback). Two steps on one screen:
 * ask for a code, then set a new PIN with it.
 *
 * The "code sent" message shows for ANY valid phone, because the endpoint
 * answers 200 either way — the response must not reveal who works here. These
 * are women whose home addresses are in this system; a reset form that
 * confirmed "yes, she is a PriyoCare caregiver" would be a directory.
 */
type Step = "phone" | "code";

export function ForgotPinForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const parsed = bdPhone.safeParse(phone);
    if (!parsed.success) {
      setErrors({ phone: ["সঠিক মোবাইল নম্বর দিন"] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/caregiver/forgot-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: parsed.data }),
      });
      if (res.status === 429) {
        setMessage("অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
        return;
      }
      // 200 regardless of whether that phone is ours — move on either way.
      setStep("code");
    } catch {
      setMessage("নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = resetPinWithOtpSchema.safeParse({ ...raw, phone });
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
      const res = await fetch("/api/v1/auth/caregiver/forgot-pin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        const data = await res.json();
        storeCaregiverTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        // She chose this PIN herself, so there is nothing to force her to
        // change — straight to work.
        router.push("/caregiver/today");
        router.refresh();
        return;
      }
      setMessage(
        res.status === 429
          ? "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"
          : "কোডটি ভুল বা মেয়াদ শেষ।",
      );
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

  const alert = message && (
    <p
      role="alert"
      className="mt-4 rounded-md border border-border bg-surface-alt p-3 text-base text-danger"
    >
      <span aria-hidden="true">! </span>
      {message}
    </p>
  );

  if (step === "phone") {
    return (
      <form onSubmit={requestCode} noValidate>
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
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
          className={fieldClass}
          aria-describedby="phone-error"
        />
        {err("phone")}
        <Button
          type="submit"
          variant="secondary"
          size="caregiver"
          disabled={busy}
          className="mt-6 w-full"
        >
          {busy ? "অপেক্ষা করুন…" : "কোড পাঠান"}
        </Button>
        {alert}
      </form>
    );
  }

  return (
    <form onSubmit={submitNewPin} noValidate>
      <p role="status" className="mb-4 rounded-md bg-teal-50 p-3 text-base text-teal-900">
        <span aria-hidden="true">✓ </span>
        এই নম্বরটি আমাদের খাতায় থাকলে একটি কোড পাঠানো হয়েছে।
      </p>

      <label className="block text-base font-medium" htmlFor="code">
        কোড (৬ সংখ্যা)
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        className={fieldClass}
        aria-describedby="code-error"
      />
      {err("code")}

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
        {busy ? "অপেক্ষা করুন…" : "পিন সেভ করে ঢুকুন"}
      </Button>
      {alert}
    </form>
  );
}
