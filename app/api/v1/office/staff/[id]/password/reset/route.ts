import { resetStaffPassword } from "@/lib/server/auth/staff-password";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";

// POST /api/v1/office/staff/{id}/password/reset — admin resets a colleague's
// forgotten password (§10.1).
//
// ADMIN ONLY. `requireStaff(req, "admin")` is not a formality here: an `ops`
// user resetting an admin's password would be a straight privilege escalation
// — take the temp password, sign in as the admin, and the role system is
// decoration. `resetStaffPassword` re-checks self-reset independently.
//
// The temp password is returned once, never stored or logged, and is
// `must_change`, so the resetting admin's knowledge of it expires at their
// colleague's next sign-in.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req, "admin");
  if (auth instanceof Response) return auth;

  const limited = await limitWrites(auth);
  if (limited) return limited;

  const staffId = Number((await ctx.params).id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return Response.json(
      { error: { code: "invalid_id", message: "Invalid staff id." } },
      { status: 400 },
    );
  }

  const result = await resetStaffPassword(staffId, Number(auth.sub));

  if (result.ok) return Response.json({ password: result.password });

  if (result.reason === "not_found") {
    return Response.json(
      { error: { code: "not_found", message: "Staff account not found." } },
      { status: 404 },
    );
  }
  if (result.reason === "self") {
    return Response.json(
      {
        error: {
          code: "self_reset",
          message: "Change your own password instead — this route is for colleagues.",
        },
      },
      { status: 409 },
    );
  }
  return Response.json(
    {
      error: {
        code: "inactive",
        message: "That account is deactivated — reactivate it before resetting a password.",
      },
    },
    { status: 409 },
  );
}
