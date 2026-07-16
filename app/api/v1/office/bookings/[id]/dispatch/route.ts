import { dispatchSchema } from "@/lib/shared/office-schemas";
import { requireStaff, jsonError, limitWrites } from "@/lib/server/auth/require-auth";
import { listEligibleForBooking } from "@/lib/server/office/queries";
import { assignCaregiver } from "@/lib/server/office/mutations";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/bookings/[id]/dispatch — Ops assigns a caregiver (§8).
// Only eligible caregivers may be chosen; choosing a non-top-ranked one
// requires a logged reason (AC 3.1). Eligibility is enforced here, server-side.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, dispatchSchema);
  if (!parsed.ok) return parsed.response;

  const bookingId = Number((await params).id);
  const eligible = await listEligibleForBooking(bookingId);
  const eligibleIds = eligible.map((c) => c.id);

  if (!eligibleIds.includes(parsed.data.caregiverId)) {
    return jsonError(422, "not_eligible", "That caregiver is not eligible for this booking.");
  }

  const isTopRanked = eligibleIds[0] === parsed.data.caregiverId;
  if (!isTopRanked && !parsed.data.reason) {
    return jsonError(
      422,
      "reason_required",
      "A reason is required to dispatch a non-top-ranked caregiver.",
    );
  }

  await assignCaregiver(
    bookingId,
    parsed.data.caregiverId,
    isTopRanked ? undefined : parsed.data.reason,
  );
  return Response.json({ ok: true });
}
