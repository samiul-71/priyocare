"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCaregiverSchema } from "@/lib/shared/office-schemas";
import { createCaregiverAction } from "@/app/(office)/actions";
import { ZONES } from "@/lib/shared/catalogue-seed";

/**
 * Start a caregiver application (§12.2). Validates against the same shared Zod
 * schema the handler uses (§10.3).
 *
 * The document fields take a REFERENCE, not a URL or an upload — private
 * storage is not wired yet (§19), and accepting a URL for a police clearance
 * would let anyone point the highest-trust record in the system at any address
 * on the internet. Ops records where the paper actually is; the checklist
 * records that a human looked at it.
 */
const SKILLS = ["phlebotomist", "attendant", "nurse", "physiotherapist", "babysitter"] as const;

type FieldErrors = Record<string, string[]>;

export function NewCaregiverForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);

    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    const candidate = {
      ...raw,
      zones: raw.zone ? [raw.zone] : [],
      ...(raw.bnmcRegNo ? { bnmcRegNo: raw.bnmcRegNo } : { bnmcRegNo: undefined }),
      ...(raw.bkashPayoutNumber
        ? { bkashPayoutNumber: raw.bkashPayoutNumber }
        : { bkashPayoutNumber: undefined }),
    };

    const parsed = createCaregiverSchema.safeParse(candidate);
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
      const res = await createCaregiverAction(parsed.data);
      if (res.ok) {
        setResult({
          ok: true,
          message: `Application #${res.data.id} created — pending verification. No login until the checklist is complete.`,
        });
        form.reset();
        setSkill("");
        router.refresh();
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

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center rounded-md bg-navy px-3 text-sm font-medium text-white"
      >
        + New application
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl rounded-lg border border-border p-4">
      <h2 className="mb-3 font-semibold text-navy">New caregiver application</h2>

      <label className="block text-sm" htmlFor="fullName">Full name</label>
      <input id="fullName" name="fullName" className={fieldClass} aria-describedby="fullName-error" />
      {err("fullName")}

      <label className="mt-3 block text-sm" htmlFor="phone">Phone</label>
      <input id="phone" name="phone" inputMode="tel" placeholder="01XXXXXXXXX" className={fieldClass} aria-describedby="phone-error" />
      {err("phone")}

      <label className="mt-3 block text-sm" htmlFor="skill">Skill</label>
      <select
        id="skill"
        name="skill"
        value={skill}
        onChange={(e) => setSkill(e.target.value)}
        className={fieldClass}
      >
        <option value="" disabled>Choose a skill…</option>
        {SKILLS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {err("skill")}
      {skill === "babysitter" && (
        // §12.2 — the highest-consequence thing the company does.
        <p className="mt-1 text-xs text-navy">
          Babysitter: two extra mandatory steps (called references + safeguarding), stricter
          clearance, no same-day first placement.
        </p>
      )}
      {skill === "nurse" && (
        <p className="mt-1 text-xs text-navy">Nurse: BNMC registration is required to activate.</p>
      )}

      {skill === "nurse" && (
        <>
          <label className="mt-3 block text-sm" htmlFor="bnmcRegNo">BNMC registration no.</label>
          <input id="bnmcRegNo" name="bnmcRegNo" className={fieldClass} aria-describedby="bnmcRegNo-error" />
          {err("bnmcRegNo")}
        </>
      )}

      <label className="mt-3 block text-sm" htmlFor="zone">Zone</label>
      <select id="zone" name="zone" className={fieldClass} defaultValue="">
        <option value="" disabled>Choose a zone…</option>
        {ZONES.map((z, i) => (
          <option key={z} value={i + 1}>{z}</option>
        ))}
      </select>

      <label className="mt-3 block text-sm" htmlFor="bkashPayoutNumber">
        bKash payout number <span className="text-text-muted">(required before activation)</span>
      </label>
      <input id="bkashPayoutNumber" name="bkashPayoutNumber" inputMode="tel" placeholder="01XXXXXXXXX" className={fieldClass} aria-describedby="bkashPayoutNumber-error" />
      {err("bkashPayoutNumber")}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-navy">Document references</legend>
        <p className="mb-2 text-xs text-text-muted">
          Where the paper is filed — not a link. Private storage lands with §19.
        </p>
        {[
          ["nidFrontRef", "NID front"],
          ["nidBackRef", "NID back"],
          ["photoRef", "Photo"],
          ["policeClearanceRef", "Police clearance"],
        ].map(([name, label]) => (
          <div key={name}>
            <label className="mt-2 block text-sm" htmlFor={name}>{label}</label>
            <input id={name} name={name} className={fieldClass} aria-describedby={`${name}-error`} />
            {err(name)}
          </div>
        ))}
      </fieldset>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-9 items-center rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create application"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-4 text-sm text-navy"
        >
          Cancel
        </button>
      </div>

      {result && (
        <p
          role="status"
          className={`mt-3 rounded-md border border-border p-3 text-sm ${
            result.ok ? "bg-teal-50 text-teal-900" : "bg-surface-alt text-danger"
          }`}
        >
          <span aria-hidden="true">{result.ok ? "✓ " : "! "}</span>
          {result.message}
        </p>
      )}
    </form>
  );
}
