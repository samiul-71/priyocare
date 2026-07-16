import { checkInSchema } from "@/lib/shared/caregiver-schemas";
import { applyCheckIn, NotAssignedError } from "@/lib/server/caregiver/mutations";
import { requireSubject, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/caregiver/check-in — Flow B, AC-1.
//
// THE RULE: the response is identical whether the caregiver is at the doorstep
// or 2km away (AC-1.1/1.2). The geofence is computed server-side, recorded to
// ops_alerts, and NEVER reflected here — not in the status, not in the body,
// not in a header. Nothing in this file may branch on it.
//
// A duplicate event_uuid is also a 200: the device retried, the work already
// landed, and telling the phone "conflict" would only make it retry harder.
export async function POST(req: Request) {
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, checkInSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await applyCheckIn(parsed.data, Number(auth.sub));
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
