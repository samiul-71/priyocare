import { careLogSchema } from "@/lib/shared/caregiver-schemas";
import { applyCareLog, NotAssignedError } from "@/lib/server/caregiver/mutations";
import { requireSubject } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/bookings/{id}/care-log — end of shift (§8).
// `occurredAt` becomes care_logs.logged_at unchanged: device time is
// authoritative (§7), so a log written offline at 17:00 says 17:00 no matter
// when it reaches us.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  const bookingId = Number((await ctx.params).id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid booking id." } },
      { status: 400 },
    );
  }

  const parsed = await parseBody(req, careLogSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await applyCareLog(
      { ...parsed.data, bookingId, vitals: parsed.data.vitals },
      Number(auth.sub),
    );
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
