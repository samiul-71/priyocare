import type { Metadata } from "next";
import Link from "next/link";
import { listEligibleForBooking } from "@/lib/server/office/queries";
import { AssignControls } from "@/components/office/AssignControls";
import { requireStaffPage } from "@/lib/server/auth/dal";

export const metadata: Metadata = { title: "Assign caregiver" };

// Assignment / dispatch (PRD §5, §9). Shows the ranked eligible caregivers;
// incompletely-verified caregivers never appear (enforced by the query filter).
export default async function AssignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPage();
  const bookingId = Number((await params).id);
  const eligible = await listEligibleForBooking(bookingId);

  const candidates = eligible.map((c) => ({
    id: c.id,
    fullName: (c as { fullName?: string }).fullName ?? `Caregiver #${c.id}`,
    ratingAvg: c.ratingAvg,
  }));

  return (
    <div>
      <div className="mb-4">
        <Link href="/office/bookings" className="text-sm text-teal-700 underline">
          ← Bookings
        </Link>
      </div>
      <h1 className="font-display text-2xl font-bold text-navy">
        Assign caregiver — booking #{bookingId}
      </h1>
      <p className="mt-1 mb-5 text-text-muted">
        Ranked by continuity of care, then rating. Only fully-verified caregivers appear.
      </p>

      {candidates.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-alt p-4 text-text-muted">
          No eligible caregivers for this booking&apos;s skill and zone.
        </p>
      ) : (
        <AssignControls bookingId={bookingId} candidates={candidates} />
      )}
    </div>
  );
}
