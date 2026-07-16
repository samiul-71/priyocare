"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { makeEvent } from "@/lib/shared/caregiver-events";
import { enqueue } from "@/lib/caregiver/queue";
import { flushQueue } from "@/lib/caregiver/sync";

/**
 * Check in / check out (§6 Flow B, AC-1, AC-4).
 *
 * The sequence is the whole module in one function:
 *
 *   1. capture GPS + timestamp LOCALLY, before any network call
 *   2. queue the event in IndexedDB — no token read, no online check
 *   3. show success
 *   4. THEN try to flush, and ignore whether it worked
 *
 * Steps 3 and 4 are in that order on purpose. The UI is identical online and
 * off (§6), identical at the doorstep and 2km away (AC-1.1/1.2), and identical
 * with a dead token (AC-4.1) — because success is declared once the event is on
 * the device, which is the moment the work is actually safe. Anything the
 * network does afterwards is the app's problem, not hers.
 *
 * A GPS failure is NOT an error either: we queue without a fix and carry on.
 * Blocking a check-in because a cheap phone could not see satellites in a
 * stairwell would be the module failing at its one job.
 */
const GPS_TIMEOUT_MS = 8_000;

async function captureLocation(): Promise<{ lat: number; lng: number; accuracyM?: number } | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: 0,
      });
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy,
    };
  } catch {
    // Denied, timed out, or no fix. Not a blocker — the work goes on.
    return undefined;
  }
}

export function CheckInOut({
  bookingId,
  checkedIn,
  checkedOut,
}: {
  bookingId: number;
  checkedIn: boolean;
  checkedOut: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"check_in" | "check_out" | null>(null);

  async function record(type: "check_in" | "check_out") {
    setBusy(true);
    try {
      const location = await captureLocation();
      // Device clock, read now — not when this eventually reaches the server (§7).
      const event = makeEvent(type, bookingId, location ? { location } : {}, new Date());

      await enqueue(event); // the work is safe from here on
      setDone(type);

      // Best-effort. Its result never changes what she sees.
      void flushQueue().then(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (checkedOut || done === "check_out") {
    return (
      <div role="status" className="rounded-xl border border-border bg-teal-50 p-5 text-center">
        <p className="text-xl font-bold text-teal-900">
          <span aria-hidden="true">✓ </span>কাজ শেষ
        </p>
        <p className="mt-1 text-base text-text-muted">চেক-আউট হয়ে গেছে। ধন্যবাদ।</p>
      </div>
    );
  }

  const isIn = checkedIn || done === "check_in";

  // One large obvious button per screen (§2) — 56px targets, 18px+ text.
  return (
    <div>
      {isIn && (
        <p role="status" className="mb-3 rounded-lg bg-teal-50 p-3 text-center text-base text-teal-900">
          <span aria-hidden="true">✓ </span>চেক-ইন হয়েছে
        </p>
      )}
      <button
        type="button"
        onClick={() => record(isIn ? "check_out" : "check_in")}
        disabled={busy}
        className={`min-h-14 w-full rounded-xl px-6 text-lg font-bold text-white disabled:opacity-60 ${
          isIn ? "bg-navy" : "bg-teal-800"
        }`}
      >
        {busy ? "অপেক্ষা করুন…" : isIn ? "চেক-আউট" : "চেক-ইন"}
      </button>
    </div>
  );
}
