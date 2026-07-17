import { rejectCaregiverSchema } from "@/lib/shared/office-schemas";
import { rejectCaregiver } from "@/lib/server/office/mutations";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/caregivers/{id}/reject — the application failed (§12.2).
//
// The `rejected` status existed in the enum and nothing set it, so a failed
// police check had no recorded outcome: the application sat at `pending`
// forever, indistinguishable from one nobody had reviewed yet.
//
// REFUSES AN APPROVED CAREGIVER (409). Rejection is a verdict on an
// application; pulling a working caregiver is /suspend, which is Flow C. The
// difference between "we never took her on" and "we took her on and something
// went wrong" is worth keeping.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  const limited = await limitWrites(auth);
  if (limited) return limited;

  const caregiverId = Number((await ctx.params).id);
  if (!Number.isInteger(caregiverId) || caregiverId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid caregiver id." } },
      { status: 400 },
    );
  }

  const parsed = await parseBody(req, rejectCaregiverSchema);
  if (!parsed.ok) return parsed.response;

  const result = await rejectCaregiver(caregiverId, parsed.data.reason, Number(auth.sub));

  if (result.ok) return Response.json({ ok: true });
  if (result.reason === "not_found") {
    return Response.json(
      { error: { code: "not_found", message: "Caregiver not found." } },
      { status: 404 },
    );
  }
  return Response.json(
    {
      error: {
        code: "already_approved",
        message: "She is already approved — suspend her instead of rejecting the application.",
      },
    },
    { status: 409 },
  );
}
