"use client";

import { useState } from "react";
import { phoneBookingSchema } from "@/lib/shared/office-schemas";
import { createPhoneBookingAction } from "@/app/(office)/actions";
import type { CatalogueService } from "@/lib/server/catalogue/queries";

/**
 * Manual phone booking form (P0, PRD §3.1). Supports ANY of the services —
 * including Physiotherapy, which has no web flow (AC 5.1). Ops quotes the price
 * on the call. Validates client-side against the SAME shared Zod schema the
 * handler uses, then POSTs to /api/v1/office/bookings.
 *
 * Services and zones come from the database via the page (module 09). They were
 * previously derived from the seed's sort order — ids that are right only on a
 * freshly seeded database, and silently book the wrong service anywhere else.
 */
const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "card", "cash"] as const;

type FieldErrors = Record<string, string[]>;

export function PhoneBookingForm({
  services,
  zones,
}: {
  services: CatalogueService[];
  zones: { id: number; name: string }[];
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    // Captured before the first await: React pools the event, so
    // `e.currentTarget` is null by the time the action resolves.
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());

    const parsed = phoneBookingSchema.safeParse(raw);
    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fe[key] ??= []).push(issue.message);
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await createPhoneBookingAction(parsed.data);
      if (res.ok) {
        setResult({ ok: true, message: `Booking created: ${res.data.bookingCode}` });
        form.reset();
      } else {
        setResult({ ok: false, message: res.error });
        if (res.fields) setErrors(res.fields);
      }
    } catch {
      setResult({ ok: false, message: "Network error — please retry." });
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

  const fieldClass =
    "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl">
      <fieldset className="mb-4">
        <legend className="mb-2 font-semibold text-navy">Caller & patient</legend>
        <label className="block text-sm" htmlFor="callerName">Caller name</label>
        <input id="callerName" name="callerName" className={fieldClass} aria-describedby="callerName-error" />
        {err("callerName")}
        <label className="mt-3 block text-sm" htmlFor="patientName">Patient name</label>
        <input id="patientName" name="patientName" className={fieldClass} aria-describedby="patientName-error" />
        {err("patientName")}
        <label className="mt-3 block text-sm" htmlFor="patientPhone">Patient phone</label>
        <input id="patientPhone" name="patientPhone" inputMode="tel" placeholder="01XXXXXXXXX" className={fieldClass} aria-describedby="patientPhone-error" />
        {err("patientPhone")}
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 font-semibold text-navy">Service & location</legend>
        <label className="block text-sm" htmlFor="serviceId">Service</label>
        <select id="serviceId" name="serviceId" className={fieldClass} defaultValue="">
          <option value="" disabled>Choose a service…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameEn}
              {!s.isActive ? " (phone only)" : ""}
            </option>
          ))}
        </select>
        {err("serviceId")}

        <label className="mt-3 block text-sm" htmlFor="zoneId">Zone</label>
        <select id="zoneId" name="zoneId" className={fieldClass} defaultValue="">
          <option value="" disabled>Choose a zone…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
        {err("zoneId")}

        <label className="mt-3 block text-sm" htmlFor="addressLine">Address</label>
        <input id="addressLine" name="addressLine" className={fieldClass} aria-describedby="addressLine-error" />
        {err("addressLine")}

        <label className="mt-3 block text-sm" htmlFor="landmark">Landmark (required)</label>
        <input id="landmark" name="landmark" className={fieldClass} aria-describedby="landmark-error" />
        {err("landmark")}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm" htmlFor="lat">Latitude</label>
            <input id="lat" name="lat" defaultValue="23.8306" className={fieldClass} aria-describedby="lat-error" />
            {err("lat")}
          </div>
          <div>
            <label className="block text-sm" htmlFor="lng">Longitude</label>
            <input id="lng" name="lng" defaultValue="90.3654" className={fieldClass} aria-describedby="lng-error" />
            {err("lng")}
          </div>
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 font-semibold text-navy">Price & payment</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm" htmlFor="priceBdt">Price (BDT)</label>
            <input id="priceBdt" name="priceBdt" inputMode="numeric" className={fieldClass} aria-describedby="priceBdt-error" />
            {err("priceBdt")}
          </div>
          <div>
            <label className="block text-sm" htmlFor="paymentMethod">Payment</label>
            <select id="paymentMethod" name="paymentMethod" className={fieldClass} defaultValue="cash">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {err("paymentMethod")}
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-10 items-center rounded-md bg-navy px-5 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create booking"}
      </button>

      {result && (
        <p
          role="status"
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.ok
              ? "border-border bg-teal-50 text-teal-900"
              : "border-border bg-surface-alt text-danger"
          }`}
        >
          <span aria-hidden="true">{result.ok ? "✓ " : "! "}</span>
          {result.message}
        </p>
      )}
    </form>
  );
}
