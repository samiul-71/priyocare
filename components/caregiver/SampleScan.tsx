"use client";

import { useState } from "react";
import { makeEvent } from "@/lib/shared/caregiver-events";
import { sampleScanSchema } from "@/lib/shared/caregiver-schemas";
import { enqueue } from "@/lib/caregiver/queue";
import { flushQueue } from "@/lib/caregiver/sync";

/**
 * Sample barcode capture (§5, §11).
 *
 * MANUAL ENTRY ONLY for now, and that is a deliberate shipping decision rather
 * than an omission: the barcode library and camera-permission UX are an open
 * question in the PRD (§14), and §11 requires a manual fallback regardless —
 * cameras fail in bad light, which is exactly where this app lives. Building
 * the fallback first means the flow works on every device today, and the camera
 * becomes an accelerator rather than a dependency.
 *
 * Like every other write here, the scan queues locally first.
 */
export function SampleScan({ bookingId }: { bookingId: number }) {
  const [barcode, setBarcode] = useState("");
  const [scanned, setScanned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const event = makeEvent("sample_scan", bookingId, { barcode });
    const parsed = sampleScanSchema.safeParse({
      eventUuid: event.eventUuid,
      occurredAt: event.occurredAt,
      barcode,
    });
    if (!parsed.success) {
      setError("বারকোড ঠিক নয় — টিউবের গায়ের নম্বরটি দিন।");
      return;
    }

    setBusy(true);
    try {
      await enqueue(event);
      setScanned((prev) => [...prev, barcode.trim()]);
      setBarcode("");
      void flushQueue();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={record}>
        <label className="block text-base font-medium text-navy" htmlFor="barcode">
          বারকোড নম্বর
        </label>
        <input
          id="barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="টিউবের গায়ে লেখা নম্বর"
          className="mt-1 w-full rounded-md border border-border px-3 py-3 text-lg"
          aria-describedby="barcode-error"
        />
        {error && (
          <p id="barcode-error" role="alert" className="mt-2 text-base text-danger">
            <span aria-hidden="true">! </span>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || barcode.trim() === ""}
          className="mt-4 min-h-14 w-full rounded-xl bg-teal-800 px-6 text-lg font-bold text-white disabled:opacity-60"
        >
          {busy ? "অপেক্ষা করুন…" : "যোগ করুন"}
        </button>
      </form>

      {scanned.length > 0 && (
        <section className="mt-6" aria-label="Scanned samples">
          <h2 className="text-base font-medium text-navy">যোগ হয়েছে ({scanned.length})</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {scanned.map((code, i) => (
              <li
                key={`${code}-${i}`}
                className="rounded-lg border border-border bg-teal-50 px-4 py-3 text-base text-teal-900"
              >
                <span aria-hidden="true">✓ </span>
                {code}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
