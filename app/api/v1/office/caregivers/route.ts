import { createCaregiverSchema } from "@/lib/shared/office-schemas";
import {
  createCaregiverApplication,
  DuplicateCaregiverError,
} from "@/lib/server/office/mutations";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/caregivers — start a caregiver application (§12.2).
//
// Intake only. The row lands `pending` with no PIN, so the caregiver it creates
// cannot log in and cannot be dispatched. Turning an application into a working
// caregiver takes the whole checklist, then activation, then a separate PIN
// call — three deliberate steps, because the person this creates will be let
// into someone's home.
export async function POST(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, createCaregiverSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await createCaregiverApplication(parsed.data);
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCaregiverError) {
      return Response.json(
        { error: { code: "duplicate_caregiver", message: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }
}
