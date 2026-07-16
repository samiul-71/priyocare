import { resetCaregiverPin } from "@/lib/server/caregiver/pin";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";

// POST /api/v1/office/caregivers/{id}/pin/reset — a forgotten PIN (§12.2).
//
// A separate endpoint from .../pin on purpose. Issuing refuses once a PIN
// exists, because a stray click that re-issued would lock out a caregiver
// mid-shift. Getting her back in has to be a deliberate act with its own name
// in the audit trail — "reset", not "issue again".
//
// Same trust model as onboarding, no weaker: Ops already interviewed her and
// checked her NID. The new PIN is must-change, so their knowledge of it expires
// at her next sign-in, and every session the old PIN opened is revoked.
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

  const result = await resetCaregiverPin(caregiverId);

  if (result.ok) {
    // Shown once, never stored or logged.
    return Response.json({ pin: result.pin });
  }
  if (result.reason === "not_found") {
    return Response.json(
      { error: { code: "not_found", message: "Caregiver not found." } },
      { status: 404 },
    );
  }
  return Response.json(
    {
      error: {
        code: "not_approved",
        message: "This caregiver is not active — reinstate them before resetting a PIN.",
      },
    },
    { status: 409 },
  );
}
