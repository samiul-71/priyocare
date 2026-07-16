import { taskTickSchema } from "@/lib/shared/caregiver-schemas";
import { applyTaskTick, NotAssignedError } from "@/lib/server/caregiver/mutations";
import { requireSubject, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// PATCH /api/v1/bookings/{id}/tasks — task tick (§8). The full tick set is sent
// each time rather than a delta: after a day offline the device's set is the
// truth, and replaying deltas out of order would corrupt it.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const bookingId = Number((await ctx.params).id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid booking id." } },
      { status: 400 },
    );
  }

  const parsed = await parseBody(req, taskTickSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await applyTaskTick({ ...parsed.data, bookingId }, Number(auth.sub));
    return Response.json({ ok: true, eventUuid: result.eventUuid, duplicate: !result.applied });
  } catch (err) {
    if (err instanceof NotAssignedError) {
      return Response.json(
        { error: { code: "not_assigned", message: "That job is not assigned to you." } },
        { status: 403 },
      );
    }
    throw err;
  }
}
