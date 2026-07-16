import { suspendSchema } from "@/lib/shared/office-schemas";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { suspendCaregiver } from "@/lib/server/office/mutations";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/caregivers/[id]/suspend — serious complaint (§8, §9).
// Immediate: removes from all dispatch AND revokes every active refresh token.
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
  await suspendCaregiver(caregiverId);
  return Response.json({ ok: true });
}
