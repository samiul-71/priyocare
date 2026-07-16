import { updateCaregiverSchema } from "@/lib/shared/office-schemas";
import { updateCaregiverFile } from "@/lib/server/office/mutations";
import { requireStaff } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// PATCH /api/v1/office/caregivers/{id} — update the file: bKash payout number,
// BNMC registration, zones (§12.2).
//
// The payout number is an activation requirement, not admin trivia: nobody
// works before we can pay them. Nothing here can change verification status or
// touch the PIN.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  const caregiverId = Number((await ctx.params).id);
  if (!Number.isInteger(caregiverId) || caregiverId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid caregiver id." } },
      { status: 400 },
    );
  }

  const parsed = await parseBody(req, updateCaregiverSchema);
  if (!parsed.ok) return parsed.response;

  const updated = await updateCaregiverFile(caregiverId, parsed.data);
  if (!updated) {
    return Response.json(
      { error: { code: "not_found", message: "Caregiver not found." } },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
