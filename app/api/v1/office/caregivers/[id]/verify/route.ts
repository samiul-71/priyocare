import { verifyStepSchema } from "@/lib/shared/office-schemas";
import { requireStaff } from "@/lib/server/auth/require-auth";
import {
  activateCaregiver,
  transitionVerificationStep,
} from "@/lib/server/office/mutations";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/caregivers/[id]/verify — mark one onboarding step complete
// (§8, §12.2), then re-evaluate activation. The response reports what is still
// missing so Ops sees exactly why a caregiver is not yet activatable.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  const parsed = await parseBody(req, verifyStepSchema);
  if (!parsed.ok) return parsed.response;

  const caregiverId = Number((await params).id);
  await transitionVerificationStep(caregiverId, parsed.data.step, Number(auth.sub));
  const activation = await activateCaregiver(caregiverId);

  return Response.json({ step: parsed.data.step, activation });
}
