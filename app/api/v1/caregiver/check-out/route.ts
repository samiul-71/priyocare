import { checkOutSchema } from "@/lib/shared/caregiver-schemas";
import { applyCheckOut, NotAssignedError } from "@/lib/server/caregiver/mutations";
import { requireSubject, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/caregiver/check-out (§8). Same shape as check-in: always
// succeeds for the assigned caregiver, duplicates are a 200.
export async function POST(req: Request) {
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, checkOutSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await applyCheckOut(parsed.data, Number(auth.sub));
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
