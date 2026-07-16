"use client";

import { useState } from "react";
import { createLeadSchema } from "@/lib/shared/lead-schemas";
import { Button } from "@/components/ui/Button";

/**
 * Public enquiry form (§5, Flow C). Validates against the SAME shared Zod
 * schema the handler uses (§10.3), then POSTs to /api/v1/leads.
 *
 * Deliberately short — name and phone are the only required fields. This is the
 * front door for Medical Tourism and Health Insurance, where the real
 * conversation happens on a call; every extra required field here costs a lead.
 *
 * Success is a promise we can keep ("we'll call you"), never a fabricated
 * timeline. Document upload waits for private storage (§11, §19) — a medical
 * report must not be attachable until it has somewhere private to land.
 */
type FieldErrors = Record<string, string[]>;

export function EnquiryForm({
  serviceId,
  serviceName,
  showDestination,
}: {
  serviceId: number;
  serviceName: string;
  showDestination: boolean;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    // Optional numeric/text fields must be absent, not "", to stay optional.
    const candidate = {
      serviceId,
      contactName: raw.contactName,
      contactPhone: raw.contactPhone,
      ...(raw.patientAge ? { patientAge: raw.patientAge } : {}),
      ...(raw.conditionSummary ? { conditionSummary: raw.conditionSummary } : {}),
      ...(raw.destinationPref ? { destinationPref: raw.destinationPref } : {}),
      ...(raw.budgetRange ? { budgetRange: raw.budgetRange } : {}),
      documents: [],
    };

    const parsed = createLeadSchema.safeParse(candidate);
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
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setDone(true);
        form.reset();
      } else if (res.status === 429) {
        setMessage("Too many enquiries from this connection. Please call 01335995555.");
      } else {
        setMessage(data?.error?.message ?? "Could not send your enquiry — please call 01335995555.");
      }
    } catch {
      setMessage("Network error. Please retry, or call 01335995555.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-border bg-teal-50 p-5">
        <h2 className="font-display text-lg font-bold text-teal-900">
          <span aria-hidden="true">✓ </span>We&apos;ll call you
        </h2>
        <p className="mt-2 text-text-muted">
          Your {serviceName} enquiry is with our team. Expect a call within one working day. For
          anything urgent, call{" "}
          <a href="tel:01335995555" className="text-teal-900 underline">
            01335995555
          </a>
          .
        </p>
      </div>
    );
  }

  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-sm text-danger">
        {errors[name].join(" ")}
      </p>
    ) : null;

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-base";

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl">
      <label className="block text-sm font-medium" htmlFor="contactName">
        Your name
      </label>
      <input id="contactName" name="contactName" className={fieldClass} aria-describedby="contactName-error" />
      {err("contactName")}

      <label className="mt-4 block text-sm font-medium" htmlFor="contactPhone">
        Mobile number
      </label>
      <input
        id="contactPhone"
        name="contactPhone"
        type="tel"
        inputMode="tel"
        placeholder="01XXXXXXXXX"
        className={fieldClass}
        aria-describedby="contactPhone-error"
      />
      {err("contactPhone")}

      <label className="mt-4 block text-sm font-medium" htmlFor="patientAge">
        Patient&apos;s age <span className="text-text-muted">(optional)</span>
      </label>
      <input
        id="patientAge"
        name="patientAge"
        inputMode="numeric"
        className={fieldClass}
        aria-describedby="patientAge-error"
      />
      {err("patientAge")}

      <label className="mt-4 block text-sm font-medium" htmlFor="conditionSummary">
        What do you need help with? <span className="text-text-muted">(optional)</span>
      </label>
      <textarea
        id="conditionSummary"
        name="conditionSummary"
        rows={4}
        placeholder="e.g. father, 62, cardiac bypass"
        className={fieldClass}
        aria-describedby="conditionSummary-error"
      />
      {err("conditionSummary")}

      {showDestination && (
        <>
          <label className="mt-4 block text-sm font-medium" htmlFor="destinationPref">
            Preferred country <span className="text-text-muted">(optional)</span>
          </label>
          <input
            id="destinationPref"
            name="destinationPref"
            placeholder="e.g. India, Thailand"
            className={fieldClass}
            aria-describedby="destinationPref-error"
          />
          {err("destinationPref")}
        </>
      )}

      <label className="mt-4 block text-sm font-medium" htmlFor="budgetRange">
        Budget range <span className="text-text-muted">(optional)</span>
      </label>
      <input id="budgetRange" name="budgetRange" className={fieldClass} aria-describedby="budgetRange-error" />
      {err("budgetRange")}

      <Button type="submit" disabled={submitting} className="mt-6 w-full sm:w-auto">
        {submitting ? "Sending…" : "Request a callback"}
      </Button>

      <p className="mt-3 text-xs text-text-muted">
        No payment now. We call you to understand your needs first.
      </p>

      {message && (
        <p role="alert" className="mt-4 rounded-md border border-border bg-surface-alt p-3 text-sm text-danger">
          <span aria-hidden="true">! </span>
          {message}
        </p>
      )}
    </form>
  );
}
