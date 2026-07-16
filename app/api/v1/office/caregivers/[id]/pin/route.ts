import { issueCaregiverPin } from "@/lib/server/office/mutations";
import { requireStaff } from "@/lib/server/auth/require-auth";

// POST /api/v1/office/caregivers/{id}/pin — issue the initial login PIN (§12.2).
//
// This is the last gate between an application and a person who can open the
// caregiver app and be sent to a patient's home. It re-evaluates the whole
// checklist from the database rather than trusting `verification_status` alone,
// so an approved-by-some-other-path caregiver still cannot get a credential
// without the steps, the payout number, and BNMC for nurses.
//
// TRADE-OFF, recorded on purpose: the plaintext PIN is returned once, for Ops
// to read to the caregiver. That means Ops briefly knows her credential. The
// alternative — she sets it herself over OTP — is better and is what §10.1's
// OTP fallback is for, but the SMS provider is not wired yet (§19). Until then
// this is an admin-issued initial credential, and "change PIN on first login"
// is tracked as the follow-up that closes it. The PIN is never stored, logged,
// or retrievable: lose it and the answer is a reset, not a lookup.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  const caregiverId = Number((await ctx.params).id);
  if (!Number.isInteger(caregiverId) || caregiverId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid caregiver id." } },
      { status: 400 },
    );
  }

  const result = await issueCaregiverPin(caregiverId);

  if (result.ok) {
    // Shown once. Not logged here or anywhere.
    return Response.json({ pin: result.pin });
  }

  if (result.reason === "not_found") {
    return Response.json(
      { error: { code: "not_found", message: "Caregiver not found." } },
      { status: 404 },
    );
  }
  if (result.reason === "already_issued") {
    // Refusing to re-issue: overwriting a live PIN would lock a working
    // caregiver out mid-shift. A forgotten PIN is a reset, not a re-issue.
    return Response.json(
      {
        error: {
          code: "already_issued",
          message: "This caregiver already has a PIN. Reset it instead of re-issuing.",
        },
      },
      { status: 409 },
    );
  }

  return Response.json(
    {
      error: {
        code: "not_approved",
        message: "Cannot issue a PIN until verification is complete.",
        missing: result.missing,
      },
    },
    { status: 409 },
  );
}
