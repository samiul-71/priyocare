import { staffLoginSchema } from "@/lib/shared/auth-schemas";
import { verifyStaffCredentials } from "@/lib/server/auth/credentials";
import { issueSession } from "@/lib/server/auth/sessions";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { beginLoginAttempt, finishLoginAttempt } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/staff/login — email + password → token with a role claim
// (§8, §10.1). No self-registration; inactive accounts cannot log in.
//
// This is the API CLIENT's login: it returns the Bearer pair. The office
// browser does not come through here any more — it signs in via a Server Action
// that issues only the cookie, so no API credential ever reaches the page
// (module 09). The cookie is still set here for API clients that also render
// pages (none today), and because a login that authenticated you should leave
// you authenticated on both seams.
//
// Credential checking lives in lib/server/auth/credentials.ts, shared with that
// action — two copies of "is this password right" is how one of them ends up
// forgetting the is_active check.
export async function POST(req: Request) {
  const parsed = await parseBody(req, staffLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

  // Tight per identity, loose per IP, and only failures count — see
  // rate-limit.ts for why the tight limit must not be the IP one.
  const identityKey = `login:email:${email}`;
  const ipKey = `login:ip:${clientIp(req)}`;
  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) return tooManyRequests(throttle.retryAfterMs);

  const staff = await verifyStaffCredentials(email, password);
  await finishLoginAttempt(identityKey, ipKey, staff !== null);

  if (!staff) {
    // One message for wrong email, wrong password, and deactivated account.
    return Response.json(
      { error: { code: "invalid_credentials", message: "Wrong email or password." } },
      { status: 401 },
    );
  }

  const session = await issueSession("staff", staff.id, staff.role);
  await setPageSessionCookie({ sub: String(staff.id), st: "staff", role: staff.role });
  return Response.json(session);
}
