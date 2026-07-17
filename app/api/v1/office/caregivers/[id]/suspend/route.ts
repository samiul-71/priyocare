import { suspendSchema } from "@/lib/shared/office-schemas";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { suspendCaregiver } from "@/lib/server/office/mutations";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/caregivers/[id]/suspend — serious complaint (§8, §9).
// Immediate: removes from all dispatch AND revokes every active refresh token.
//
// The reason is now RECORDED against the caregiver. It was required by the
// schema, parsed here, and then discarded — so a caregiver's work could end and
// nothing anywhere said why.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, suspendSchema);
  if (!parsed.ok) return parsed.response;

  const caregiverId = Number((await params).id);
  if (!Number.isInteger(caregiverId) || caregiverId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid caregiver id." } },
      { status: 400 },
    );
  }

  // The actor is the staff id from the verified token, never a caller-supplied
  // one — the audit trail must not be attributable to anyone else.
  await suspendCaregiver(caregiverId, parsed.data.reason, Number(auth.sub));
  return Response.json({ ok: true });
}
