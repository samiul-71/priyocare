import type { Metadata } from "next";
import { StatusStepper } from "@/components/customer/StatusStepper";
import { getBookingTracking } from "@/lib/server/booking/tracking";
import {
  BOOKING_STEPS,
  bookingStepIndex,
  isTerminalCancelled,
} from "@/lib/shared/tracking";

export const metadata: Metadata = { title: "Track your visit" };
export const dynamic = "force-dynamic";

// /bookings/[id]/track (PRD §5, §11). Live status of the visit. Geofence
// outcomes are never shown here (AC 4.2); a delayed feed keeps the last-known
// state rather than inventing one (never a fabricated status).
export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const bookingId = Number((await params).id);
  const tracking = await getBookingTracking(bookingId);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">Track your visit</h1>

      {!tracking ? (
        <p className="mt-4 rounded-[10px] border border-border bg-surface-alt p-4 text-text-muted">
          Collector not yet dispatched. This page will update once someone is on the way.
        </p>
      ) : isTerminalCancelled(tracking.status) ? (
        <p className="mt-4 rounded-[10px] border border-border bg-surface-alt p-4 text-text-muted">
          This booking was cancelled.
        </p>
      ) : (
        <div className="mt-5">
          <p className="mb-4 text-sm text-text-muted">
            Booking <span className="tabular font-medium text-navy">{tracking.bookingCode}</span>
            {tracking.serviceName ? ` · ${tracking.serviceName}` : ""}
          </p>

          <StatusStepper steps={BOOKING_STEPS} currentIndex={bookingStepIndex(tracking.status)} />

          {tracking.caregiverName && (
            <div className="mt-6 flex items-center justify-between rounded-[10px] border border-border p-4">
              <div>
                <p className="font-medium text-navy">{tracking.caregiverName}</p>
                {tracking.caregiverRating && (
                  <p className="tabular text-sm text-text-muted">★ {Number(tracking.caregiverRating).toFixed(2)}</p>
                )}
              </div>
              {/* Masked calling — the real number is never exposed (PRD §10.5). */}
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-[10px] bg-teal-800 px-4 font-medium text-white"
              >
                Call (masked)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
