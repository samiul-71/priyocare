"use client";

import { useState } from "react";
import { makeEvent } from "@/lib/shared/caregiver-events";
import { enqueue } from "@/lib/caregiver/queue";
import { flushQueue } from "@/lib/caregiver/sync";

/**
 * End-of-shift care log (§5, §8).
 *
 * `occurredAt` is the device clock at submit and becomes `care_logs.logged_at`
 * unchanged (§7) — a log written at 17:00 in a signal-less flat still says
 * 17:00 when it syncs at 21:00. That is the record of when care happened, and
 * it is not the server's to correct.
 *
 * Vitals are optional and free-form per service. Mood is three plain choices,
 * not a scale: a tired person at the end of a shift should not be parsing a
 * 1–10 scale, and "good / ok / poor" is what Ops actually acts on.
 */
const MOODS = [
  { value: "good", label: "ভালো", icon: "☺" },
  { value: "ok", label: "মোটামুটি", icon: "•" },
  { value: "poor", label: "খারাপ", icon: "☹" },
] as const;

export function CareLogForm({ bookingId, tasks }: { bookingId: number; tasks: string[] }) {
  const [mood, setMood] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);

    const form = new FormData(e.currentTarget);
    const vitals = {
      bpSystolic: form.get("bpSystolic") || undefined,
      bpDiastolic: form.get("bpDiastolic") || undefined,
      pulse: form.get("pulse") || undefined,
      tempC: form.get("tempC") || undefined,
    };
    const hasVitals = Object.values(vitals).some((v) => v !== undefined && v !== "");

    try {
      await enqueue(
        makeEvent("care_log", bookingId, {
          tasksCompleted: tasks,
          notes: (form.get("notes") as string) || undefined,
          mood: mood || undefined,
          ...(hasVitals ? { vitals } : {}),
        }),
      );
      setSaved(true); // the log is safe on the device — that is what "saved" means
      void flushQueue();
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div role="status" className="rounded-xl border border-border bg-teal-50 p-5 text-center">
        <p className="text-xl font-bold text-teal-900">
          <span aria-hidden="true">✓ </span>লগ সেভ হয়েছে
        </p>
        <p className="mt-1 text-base text-text-muted">
          নেটওয়ার্ক এলে নিজে থেকেই পাঠিয়ে দেবে।
        </p>
      </div>
    );
  }

  const fieldClass = "mt-1 w-full rounded-md border border-border px-3 py-3 text-lg";

  return (
    <form onSubmit={submit}>
      <fieldset className="mb-5">
        <legend className="mb-2 text-base font-medium text-navy">রোগীর অবস্থা</legend>
        <div className="flex gap-2">
          {MOODS.map((m) => (
            <label
              key={m.value}
              className={`flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border text-base ${
                mood === m.value ? "border-teal-800 bg-teal-50 text-teal-900" : "border-border bg-white text-navy"
              }`}
            >
              <input
                type="radio"
                name="mood"
                value={m.value}
                checked={mood === m.value}
                onChange={() => setMood(m.value)}
                className="sr-only"
              />
              <span aria-hidden="true">{m.icon}</span>
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="mb-2 text-base font-medium text-navy">
          ভাইটালস <span className="font-normal text-text-muted">(ঐচ্ছিক)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-muted" htmlFor="bpSystolic">
              BP (systolic)
            </label>
            <input id="bpSystolic" name="bpSystolic" inputMode="numeric" className={fieldClass} />
          </div>
          <div>
            <label className="block text-sm text-text-muted" htmlFor="bpDiastolic">
              BP (diastolic)
            </label>
            <input id="bpDiastolic" name="bpDiastolic" inputMode="numeric" className={fieldClass} />
          </div>
          <div>
            <label className="block text-sm text-text-muted" htmlFor="pulse">
              পালস
            </label>
            <input id="pulse" name="pulse" inputMode="numeric" className={fieldClass} />
          </div>
          <div>
            <label className="block text-sm text-text-muted" htmlFor="tempC">
              তাপমাত্রা (°C)
            </label>
            <input id="tempC" name="tempC" inputMode="decimal" className={fieldClass} />
          </div>
        </div>
      </fieldset>

      <label className="block text-base font-medium text-navy" htmlFor="notes">
        নোট
      </label>
      <textarea id="notes" name="notes" rows={4} className={fieldClass} />

      <button
        type="submit"
        disabled={busy}
        className="mt-6 min-h-14 w-full rounded-xl bg-teal-800 px-6 text-lg font-bold text-white disabled:opacity-60"
      >
        {busy ? "সেভ হচ্ছে…" : "লগ সেভ করুন"}
      </button>
    </form>
  );
}
