import { updateLeadSchema } from "@/lib/shared/lead-schemas";
import {
  InvalidStageChangeError,
  LeadNotFoundError,
  updateLead,
} from "@/lib/server/leads/mutations";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// PATCH /api/v1/office/leads/{id} — Ops advances a lead (§8). A stage change
// ALWAYS logs a lead_activity (AC-3.1); that happens inside the same
// transaction as the update, so an advance can never land unrecorded.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const leadId = Number((await ctx.params).id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid lead id." } },
      { status: 400 },
    );
  }

  const parsed = await parseBody(req, updateLeadSchema);
  if (!parsed.ok) return parsed.response;

  try {
    // The staff id from the verified token is the activity's actor — never a
    // caller-supplied one, or the audit trail could be attributed to anyone.
    const lead = await updateLead(leadId, parsed.data, Number(auth.sub));
    return Response.json({ id: lead.id, stage: lead.stage, nextActionAt: lead.nextActionAt });
  } catch (err) {
    if (err instanceof LeadNotFoundError) {
      return Response.json(
        { error: { code: "not_found", message: "Lead not found." } },
        { status: 404 },
      );
    }
    if (err instanceof InvalidStageChangeError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: 409 });
    }
    throw err;
  }
}
